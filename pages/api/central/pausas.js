// Pausa por canal do YouTube (vale para a nuvem e para todos os PCs).
// GET                                  -> { canais: { [id]: { titulo, em } } }
// POST { canalId, titulo, pausado }    -> { ok, canais }
import { exigirToken } from '../../../lib/central';
import { lerPausas, pausarCanal } from '../../../lib/pausas';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ canais: await lerPausas({ fresco: true }) });
    if (req.method === 'POST') {
      const { canalId, titulo, pausado } = req.body || {};
      if (!canalId) return res.status(400).json({ erro: 'Falta o canal.' });
      return res.status(200).json({ ok: true, canais: await pausarCanal(canalId, titulo, !!pausado) });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
