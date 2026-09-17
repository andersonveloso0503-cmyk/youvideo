import { put } from '@vercel/blob';
import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { colecao, itemId, novoFormato, ambiente } = req.body;
  if (!colecao || !itemId || !novoFormato) {
    return res.status(400).json({ error: 'colecao, itemId e novoFormato são obrigatórios' });
  }

  try {
    const db = getDb();
    const baseUrl = `https://${req.headers.host}`;
    let bodyMontagem;
    let titulo;
    let thumbnailUrl;
    let canal;

    if (colecao === 'projeto') {
      // Vídeos salvos a partir de telas manuais (ex: /desenho) guardam o
      // áudio/cenas/palavras direto no próprio documento de youvideo_projects,
      // sem passar pela fila — reaproveita esses dados direto daqui.
      const doc = await db.collection('youvideo_projects').doc(itemId).get();
      if (!doc.exists) return res.status(404).json({ error: 'Projeto não encontrado' });
      const projeto = doc.data();

      if (!projeto.audioUrl || !projeto.cenas) {
        return res.status(400).json({
          error:
            'Esse projeto não tem áudio/imagens salvos pra reaproveitar (foi salvo antes dessa função existir, ou veio de uma tela antiga). Não dá pra reformatar sem gerar de novo.',
        });
      }

      bodyMontagem = { audioUrl: projeto.audioUrl, cenas: projeto.cenas, formato: novoFormato, palavras: projeto.palavras, ambiente: ambiente || 'production' };
      titulo = projeto.titulo;
      thumbnailUrl = projeto.thumbnailUrl || null;
      canal = projeto.canal || 'apostolos';
    } else if (colecao === 'medley') {
      // O medley guarda cada música separada com seu próprio áudio/cena —
      // remonta a faixa combinada exatamente como o medley-processar.js faz
      // na hora de montar de verdade, com os mesmos offsets acumulados.
      const doc = await db.collection('youvideo_medley').doc(itemId).get();
      if (!doc.exists) return res.status(404).json({ error: 'Medley não encontrado' });
      const medley = doc.data();
      const musicas = medley.musicas || [];

      if (!musicas.length || musicas.some((m) => !m.arquivo?.imageUrl || !m.audioUrl)) {
        return res.status(400).json({ error: 'Esse medley não tem todas as músicas com áudio/imagem prontos pra reaproveitar' });
      }

      let cursor = 0;
      const audioSegments = [];
      const cenasCombinadas = [];
      const palavrasCombinadas = [];
      for (const m of musicas) {
        audioSegments.push({ url: m.audioUrl, start: cursor, length: m.duracao });
        cenasCombinadas.push({ ...m.arquivo, start: cursor, length: m.duracao });
        for (const p of m.palavras || []) {
          palavrasCombinadas.push({ texto: p.texto, start: p.start + cursor, end: p.end + cursor });
        }
        cursor += m.duracao;
      }

      const dadosBlob = await put(
        `reformatar-dados-${Date.now()}.json`,
        JSON.stringify({ audioSegments, cenas: cenasCombinadas, palavras: palavrasCombinadas }),
        { access: 'public', contentType: 'application/json', token: process.env.MEDIA_READ_WRITE_TOKEN }
      );

      bodyMontagem = { dataUrl: dadosBlob.url, formato: novoFormato, ambiente: ambiente || 'production' };
      titulo = medley.titulo;
      thumbnailUrl = medley.textoThumbnail ? null : null; // thumbnail é gerada de novo separadamente, se precisar
      canal = medley.canal || 'musica';
    } else {
      const nomeColecao = colecao === 'fila' ? 'youvideo_fila' : 'youvideo_musica_fila';
      const doc = await db.collection(nomeColecao).doc(itemId).get();
      if (!doc.exists) return res.status(404).json({ error: 'Item não encontrado nessa coleção' });
      const item = doc.data();

      // Os vídeos bíblicos (fila) guardam os dados dentro de narracao/roteiro;
      // os de música (musica_fila) guardam direto na raiz do documento.
      const audioUrl = colecao === 'fila' ? item.narracao?.audioUrl : item.audioUrl;
      const cenas = item.arquivos;
      const palavras = colecao === 'fila' ? item.narracao?.palavras : item.palavras;

      if (!audioUrl || !cenas) {
        return res.status(400).json({
          error:
            'Esse item não tem áudio/imagens salvos pra reaproveitar (pode ser antigo demais, ainda não ter terminado de processar, ou vir de um medley — nesse caso escolha "colecao: medley" com o ID original do medley em vez do ID da fila).',
        });
      }

      bodyMontagem = { audioUrl, cenas, formato: novoFormato, palavras, ambiente: ambiente || 'production' };
      titulo = colecao === 'fila' ? item.roteiro?.titulo : item.titulo;
      thumbnailUrl = item.thumbnailUrl || null;
      canal = item.canal || 'apostolos';
    }

    const montagemRes = await fetch(`${baseUrl}/api/assemble-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyMontagem),
    });
    const montagemData = await montagemRes.json();
    if (!montagemRes.ok) throw new Error(montagemData.error || 'Erro ao iniciar a remontagem');

    return res.status(200).json({
      renderId: montagemData.renderId,
      titulo,
      thumbnailUrl,
      canal,
      ambiente: ambiente || 'production',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

