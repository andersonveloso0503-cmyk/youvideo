import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('youvideo_medley').orderBy('criadoEm', 'desc').limit(20).get();
    const medleys = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        titulo: d.titulo,
        status: d.status,
        erro: d.erro || null,
        totalMusicas: (d.musicas || []).length,
        musicasStatus: (d.musicas || []).map((m) => m.status),
        criadoEm: d.criadoEm,
      };
    });
    return res.status(200).json({ medleys });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
