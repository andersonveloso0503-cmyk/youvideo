import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('youvideo_musica_fila').orderBy('criadoEm', 'desc').limit(30).get();
    const fila = snapshot.docs.map((doc) => ({
      id: doc.id,
      titulo: doc.data().titulo,
      estilo: doc.data().estilo,
      formato: doc.data().formato,
      status: doc.data().status,
      erro: doc.data().erro || null,
      youtubeVideoId: doc.data().youtubeVideoId || null,
      criadoEm: doc.data().criadoEm,
    }));
    return res.status(200).json({ fila });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
