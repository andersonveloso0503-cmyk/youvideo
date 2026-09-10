import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioUrl, letra, titulo, estilo, formato, textoThumbnail } = req.body;
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl é obrigatório (suba o áudio primeiro)' });
  if (!letra || !letra.trim()) return res.status(400).json({ error: 'Letra da música é obrigatória' });
  if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });

  try {
    const db = getDb();
    const docRef = await db.collection('youvideo_musica_fila').add({
      audioUrl,
      letra,
      titulo,
      estilo: estilo || 'cinematografico',
      formato: formato || 'longo',
      textoThumbnail: textoThumbnail || '',
      canal: 'musica',
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    });
    return res.status(200).json({ id: docRef.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
