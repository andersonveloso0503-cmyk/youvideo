import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('canais').orderBy('criadoEm', 'desc').get();
    const canais = snapshot.docs.map((doc) => ({
      id: doc.id,
      nome: doc.data().nome,
      status: doc.data().status,
    }));
    return res.status(200).json({ canais });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
