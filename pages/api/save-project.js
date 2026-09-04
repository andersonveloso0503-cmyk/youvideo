import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, estilo, formato, titulo, descricao, videoUrl, thumbnailUrl } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Nada pra salvar ainda (gere o roteiro primeiro)' });

  try {
    const db = getDb();
    const docRef = await db.collection('youvideo_projects').add({
      tema: tema || '',
      estilo: estilo || '',
      formato: formato || '',
      titulo,
      descricao: descricao || '',
      videoUrl: videoUrl || null,
      thumbnailUrl: thumbnailUrl || null,
      criadoEm: new Date().toISOString(),
    });

    return res.status(200).json({ id: docRef.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
