import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { medleyId, audioUrl, letra } = req.body;
  if (!medleyId) return res.status(400).json({ error: 'medleyId é obrigatório' });
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl é obrigatório' });
  if (!letra || !letra.trim()) return res.status(400).json({ error: 'Letra da música é obrigatória' });

  try {
    const db = getDb();
    const ref = db.collection('youvideo_medley').doc(medleyId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Medley não encontrado' });

    const medley = doc.data();
    if (medley.status !== 'coletando') {
      return res.status(400).json({ error: 'Esse medley já foi finalizado, não dá mais pra adicionar música nele.' });
    }

    const musicas = medley.musicas || [];
    musicas.push({
      audioUrl,
      letra,
      ordem: musicas.length,
      status: 'pendente',
    });

    await ref.update({ musicas });
    return res.status(200).json({ ok: true, totalMusicas: musicas.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
