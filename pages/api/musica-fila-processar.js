import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  const db = getDb();
  const baseUrl = `https://${req.headers.host}`;

  try {
    const snapshot = await db
      .collection('youvideo_musica_fila')
      .where('status', 'not-in', ['renderizado', 'concluido', 'erro'])
      .orderBy('status')
      .orderBy('criadoEm')
      .limit(1)
      .get();

    if (snapshot.empty) return res.status(200).json({ mensagem: 'Fila de música vazia, nada a processar.' });

    const doc = snapshot.docs[0];
    const item = doc.data();
    const ref = doc.ref;

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

    switch (item.status) {
      case 'pendente': {
        const { palavras, blocos } = await chamar('/api/align-letra', { audioUrl: item.audioUrl, letra: item.letra });
        await ref.update({ palavras, blocos, status: 'alinhado' });
        break;
      }

      case 'alinhado': {
        const { cenas } = await chamar('/api/generate-cenas-musica', { blocos: item.blocos, estilo: item.estilo });
        await ref.update({ cenas, status: 'cenas_ok' });
        break;
      }

      case 'cenas_ok': {
        const { arquivos } = await chamar('/api/generate-visual', { cenas: item.cenas, estilo: item.estilo, formato: item.formato });
        await ref.update({ arquivos, status: 'imagens_ok' });
        break;
      }

      case 'imagens_ok': {
        const { renderId } = await chamar('/api/assemble-video', {
          audioUrl: item.audioUrl,
          cenas: item.arquivos,
          formato: item.formato,
          palavras: item.palavras,
        });
        await ref.update({ renderId, status: 'montando' });
        break;
      }

      case 'montando': {
        const checkRes = await fetch(`${baseUrl}/api/assemble-video?id=${item.renderId}`);
        const check = await checkRes.json();
        if (!checkRes.ok) throw new Error(check.error || 'Erro checando a montagem');

        if (check.status === 'done') {
          const thumb = await chamar('/api/generate-thumbnail', {
            tema: item.titulo,
            titulo: item.titulo,
            estilo: item.estilo,
            textoThumbnail: item.textoThumbnail,
          });
          await ref.update({
            videoUrl: check.videoUrl,
            thumbnailUrl: thumb.imageUrl || null,
            status: 'renderizado',
          });
        } else if (check.status === 'failed') {
          await ref.update({ status: 'erro', erro: `Falha na montagem da Shotstack: ${check.erro || 'motivo não informado'}` });
        }
        // Se ainda estiver processando na Shotstack, não faz nada — a
        // próxima chamada do cron confere de novo.
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ processado: doc.id, statusAnterior: item.status });
  } catch (err) {
    // Marca o item com erro em vez de deixar a fila travada tentando a
    // mesma etapa pra sempre.
    try {
      const snapshot = await db
        .collection('youvideo_musica_fila')
        .where('status', 'not-in', ['renderizado', 'concluido', 'erro'])
        .orderBy('status')
        .orderBy('criadoEm')
        .limit(1)
        .get();
      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({ status: 'erro', erro: err.message });
      }
    } catch {
      // Se nem isso der certo, só devolve o erro original abaixo.
    }
    return res.status(500).json({ error: err.message });
  }
}
