import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, estilo, formato, duracaoDesejada } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema é obrigatório' });

  try {
    const db = getDb();
    const docRef = await db.collection('youvideo_fila').add({
      tema,
      estilo: estilo || 'realista',
      formato: formato || 'longo',
      duracaoDesejada: duracaoDesejada || (formato === 'short' ? '180' : '420'),
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    });
    return res.status(200).json({ id: docRef.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
