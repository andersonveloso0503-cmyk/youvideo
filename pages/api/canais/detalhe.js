import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  const { canalId } = req.query;
  if (!canalId) return res.status(400).json({ error: 'canalId é obrigatório' });

  try {
    const db = getDb();
    const snap = await db.collection('canais').doc(canalId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Canal não encontrado' });
    return res.status(200).json({ id: snap.id, ...snap.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
