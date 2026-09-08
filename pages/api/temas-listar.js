import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('youvideo_temas').orderBy('criadoEm', 'asc').limit(200).get();
    const temas = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ temas });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
