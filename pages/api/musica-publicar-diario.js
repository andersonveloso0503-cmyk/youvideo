import { getDb } from '../../lib/firebase-admin';


// Aumenta o limite de execução da função (padrão é bem curto e cortava
// respostas de IA mais demoradas no meio). Precisa do plano Pro do
// Vercel pra valer mais que ~60s.
export const maxDuration = 300;

export default async function handler(req, res) {
  const db = getDb();
  const baseUrl = `https://${req.headers.host}`;

  try {
    const snapshot = await db
      .collection('youvideo_musica_fila')
      .where('status', '==', 'renderizado')
      .orderBy('criadoEm', 'asc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ mensagem: 'Nenhuma música pronta pra publicar hoje.' });
    }

    const doc = snapshot.docs[0];
    const item = doc.data();

    const uploadRes = await fetch(`${baseUrl}/api/youtube-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: item.videoUrl,
        thumbnailUrl: item.thumbnailUrl,
        titulo: item.titulo,
        descricao: `${item.titulo} 🙏 Uma música de fé e louvor.\n\n#gospel #louvor #fe #jesus #musicacrista`,
        tags: ['gospel', 'louvor', 'música gospel', 'adoração', 'sertanejo gospel', 'hinos evangélicos', 'louvores antigos', 'playlist gospel'],
        canal: 'musica',
        palavras: item.palavras,
      }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || 'Erro ao publicar no YouTube');

    await db.collection('youvideo_projects').add({
      tema: item.titulo,
      estilo: item.estilo,
      formato: item.formato,
      titulo: item.titulo,
      descricao: item.letra,
      videoUrl: item.videoUrl,
      thumbnailUrl: item.thumbnailUrl || null,
      youtubeVideoId: uploadData.videoId || null,
      canal: 'musica',
      criadoEm: new Date().toISOString(),
    });

    await doc.ref.update({ status: 'concluido', youtubeVideoId: uploadData.videoId || null });

    return res.status(200).json({ publicado: item.titulo, videoId: uploadData.videoId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
