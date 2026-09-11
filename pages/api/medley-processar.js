import { getDb } from '../../lib/firebase-admin';
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  const db = getDb();
  const baseUrl = `https://${req.headers.host}`;

  const chamar = async (endpoint, body) => {
    const r = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Erro chamando ${endpoint}`);
    return data;
  };

  const probarDuracao = async (audioUrl) => {
    const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
    const probeRes = await fetch(`https://api.shotstack.io/edit/${env}/probe/${encodeURIComponent(audioUrl)}`, {
      headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
    });
    const data = await probeRes.json();
    if (!probeRes.ok) throw new Error(data.message || 'Erro ao consultar a duração do áudio na Shotstack');
    const duracao = parseFloat(data.response?.metadata?.streams?.[0]?.duration);
    if (!duracao) throw new Error('Não consegui identificar a duração desse áudio');
    return duracao;
  };

  try {
    // 1) Tem algum medley ainda coletando/processando músicas individualmente?
    const processando = await db
      .collection('youvideo_medley')
      .where('status', '==', 'processando')
      .orderBy('criadoEm', 'asc')
      .limit(1)
      .get();

    if (!processando.empty) {
      const doc = processando.docs[0];
      const medley = doc.data();
      const musicas = medley.musicas || [];
      const idx = musicas.findIndex((m) => m.status !== 'imagem_ok');

      if (idx === -1) {
        // Todas as músicas já têm letra alinhada + cena + imagem prontas —
        // hora de juntar tudo numa faixa só e mandar montar.
        let cursor = 0;
        const audioSegments = [];
        const cenasCombinadas = [];
        const palavrasCombinadas = [];

        for (const m of musicas) {
          audioSegments.push({ url: m.audioUrl, start: cursor, length: m.duracao });
          if (m.arquivo) {
            cenasCombinadas.push({ ...m.arquivo, start: cursor, length: m.duracao });
          }
          for (const p of m.palavras || []) {
            palavrasCombinadas.push({ texto: p.texto, start: p.start + cursor, end: p.end + cursor });
          }
          cursor += m.duracao;
        }

        const dadosBlob = await put(
          `medley-dados-${Date.now()}.json`,
          JSON.stringify({ audioSegments, cenas: cenasCombinadas, palavras: palavrasCombinadas }),
          { access: 'public', contentType: 'application/json', token: process.env.MEDIA_READ_WRITE_TOKEN }
        );

        const { renderId } = await chamar('/api/assemble-video', {
          dataUrl: dadosBlob.url,
          formato: medley.formato,
        });

        await doc.ref.update({ renderId, status: 'montando' });
        return res.status(200).json({ medley: doc.id, avancou: 'montagem final iniciada' });
      }

      const musica = musicas[idx];

      try {
        switch (musica.status) {
          case 'pendente': {
            const { palavras, blocos } = await chamar('/api/align-letra', { audioUrl: musica.audioUrl, letra: musica.letra });
            const duracao = await probarDuracao(musica.audioUrl);
            musicas[idx] = { ...musica, palavras, blocoCompleto: blocos, duracao, status: 'alinhado' };
            await doc.ref.update({ musicas });
            break;
          }

          case 'alinhado': {
            // 1 cena só pra música inteira (não por bloco), pra não gerar
            // dezenas de imagens numa faixa longa.
            const blocoUnico = [{ tipo: 'Música completa', texto: musica.letra, start: 0, end: musica.duracao }];
            const { cenas } = await chamar('/api/generate-cenas-musica', { blocos: blocoUnico, estilo: medley.estilo });
            musicas[idx] = { ...musica, cena: cenas[0], status: 'cenas_ok' };
            await doc.ref.update({ musicas });
            break;
          }

          case 'cenas_ok': {
            const { arquivos } = await chamar('/api/generate-visual', {
              cenas: [musica.cena],
              estilo: medley.estilo,
              formato: medley.formato,
            });
            if (!arquivos[0]?.imageUrl) {
              throw new Error(
                `A imagem da música #${idx + 1} foi bloqueada pelo filtro de conteúdo da Flux: ${
                  arquivos[0]?.erro || 'motivo não informado'
                }. Tente descrever a cena de outro jeito ou pule essa música.`
              );
            }
            musicas[idx] = { ...musica, arquivo: arquivos[0], status: 'imagem_ok' };
            await doc.ref.update({ musicas });
            break;
          }

          default:
            break;
        }
      } catch (erroMusica) {
        await doc.ref.update({ status: 'erro', erro: erroMusica.message });
        return res.status(200).json({ medley: doc.id, erro: erroMusica.message });
      }

      return res.status(200).json({ medley: doc.id, musicaProcessada: idx, statusAnterior: musica.status });
    }

    // 2) Tem algum medley com a montagem final em andamento?
    const montando = await db.collection('youvideo_medley').where('status', '==', 'montando').limit(1).get();
    if (!montando.empty) {
      const doc = montando.docs[0];
      const medley = doc.data();

      const checkRes = await fetch(`${baseUrl}/api/assemble-video?id=${medley.renderId}`);
      const check = await checkRes.json();
      if (!checkRes.ok) throw new Error(check.error || 'Erro checando a montagem do medley');

      if (check.status === 'done') {
        const thumb = await chamar('/api/generate-thumbnail', {
          tema: medley.titulo,
          titulo: medley.titulo,
          estilo: medley.estilo,
          textoThumbnail: medley.textoThumbnail,
        });

        // Entrega pronto pra fila normal de publicação (1 por dia), sem
        // precisar de um cron de publicação separado só pra medley.
        const letraCombinada = (medley.musicas || []).map((m) => m.letra).join('\n\n---\n\n');
        await db.collection('youvideo_musica_fila').add({
          titulo: medley.titulo,
          letra: letraCombinada,
          estilo: medley.estilo,
          formato: medley.formato,
          canal: medley.canal,
          status: 'renderizado',
          videoUrl: check.videoUrl,
          thumbnailUrl: thumb.imageUrl || null,
          criadoEm: new Date().toISOString(),
        });

        await doc.ref.update({ status: 'concluido' });
        return res.status(200).json({ medley: doc.id, avancou: 'renderizado e entregue pra fila de publicação' });
      }

      if (check.status === 'failed') {
        await doc.ref.update({ status: 'erro', erro: `Falha na montagem: ${check.erro || 'motivo não informado'}` });
        return res.status(200).json({ medley: doc.id, erro: 'montagem falhou' });
      }

      return res.status(200).json({ medley: doc.id, mensagem: 'ainda montando na Shotstack' });
    }

    return res.status(200).json({ mensagem: 'Nenhum medley pra processar agora.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
