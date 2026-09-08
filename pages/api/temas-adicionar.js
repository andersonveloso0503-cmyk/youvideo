import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { temas } = req.body;
  if (!temas || !temas.length) return res.status(400).json({ error: 'Lista de temas é obrigatória' });

  try {
    const db = getDb();
    const batch = db.batch();
    temas.forEach((tema) => {
      const ref = db.collection('youvideo_temas').doc();
      batch.set(ref, { tema, usado: false, criadoEm: new Date().toISOString() });
    });
    await batch.commit();
    return res.status(200).json({ adicionados: temas.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
