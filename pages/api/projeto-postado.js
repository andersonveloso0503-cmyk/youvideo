import { getDb } from '../../lib/firebase-admin';

// Marca (ou desmarca) à mão que o vídeo do projeto já foi postado numa rede.
// POST { id, rede, feito: true|false }
const REDES = ['youtube', 'tiktok', 'kwai', 'facebook', 'instagram'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id, rede, feito } = req.body || {};
  if (!id || !REDES.includes(rede)) return res.status(400).json({ error: 'Pedido inválido.' });
  try {
    await getDb().collection('youvideo_projects').doc(String(id)).update({ [`postado.${rede}`]: feito ? new Date().toISOString() : false });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
