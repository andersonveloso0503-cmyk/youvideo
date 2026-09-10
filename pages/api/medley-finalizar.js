import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { medleyId } = req.body;
  if (!medleyId) return res.status(400).json({ error: 'medleyId é obrigatório' });

  try {
    const db = getDb();
    const ref = db.collection('youvideo_medley').doc(medleyId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Medley não encontrado' });

    const medley = doc.data();
    if (!medley.musicas || !medley.musicas.length) {
      return res.status(400).json({ error: 'Adicione pelo menos 1 música antes de finalizar' });
    }

    await ref.update({ status: 'processando' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
