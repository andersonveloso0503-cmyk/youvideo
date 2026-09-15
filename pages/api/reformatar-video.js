import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { colecao, itemId, novoFormato, ambiente } = req.body;
  if (!colecao || !itemId || !novoFormato) {
    return res.status(400).json({ error: 'colecao, itemId e novoFormato são obrigatórios' });
  }

  const nomeColecao = colecao === 'fila' ? 'youvideo_fila' : 'youvideo_musica_fila';

  try {
    const db = getDb();
    const doc = await db.collection(nomeColecao).doc(itemId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Item não encontrado nessa coleção' });

    const item = doc.data();

    // Os vídeos bíblicos (fila) guardam os dados dentro de narracao/roteiro;
    // os de música (musica_fila) guardam direto na raiz do documento.
    const audioUrl = colecao === 'fila' ? item.narracao?.audioUrl : item.audioUrl;
    const cenas = item.arquivos;
    const palavras = colecao === 'fila' ? item.narracao?.palavras : item.palavras;
    const titulo = colecao === 'fila' ? item.roteiro?.titulo : item.titulo;
    const thumbnailUrl = item.thumbnailUrl || null;
    const canal = item.canal || 'apostolos';

    if (!audioUrl || !cenas) {
      return res.status(400).json({ error: 'Esse item não tem áudio/imagens salvos pra reaproveitar (pode ser antigo demais ou ainda não ter terminado de processar)' });
    }

    const baseUrl = `https://${req.headers.host}`;
    const montagemRes = await fetch(`${baseUrl}/api/assemble-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl, cenas, formato: novoFormato, palavras, ambiente: ambiente || 'production' }),
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
