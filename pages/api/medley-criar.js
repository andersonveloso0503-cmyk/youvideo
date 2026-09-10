import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { titulo, estilo, formato, textoThumbnail } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });

  try {
    const db = getDb();
    const docRef = await db.collection('youvideo_medley').add({
      titulo,
      estilo: estilo || 'cinematografico',
      formato: formato || 'longo',
      textoThumbnail: textoThumbnail || '',
      canal: 'musica',
      musicas: [],
      status: 'coletando',
      criadoEm: new Date().toISOString(),
    });
    return res.status(200).json({ id: docRef.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
