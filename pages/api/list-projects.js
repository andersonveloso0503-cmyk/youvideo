import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(50).get();
    const projetos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ projetos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
