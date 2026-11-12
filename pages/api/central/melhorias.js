// "O que melhorar" do Painel.
// POST { canais:[{ canalId, canal, de, ate, videos:[...], trafego:{...} }] }  (o Compilador manda a cada 6 h)
// GET  -> as dicas guardadas
import { exigirToken } from '../../../lib/central';
import { guardarMelhorias, lerMelhorias } from '../../../lib/melhorias';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'POST') return res.status(200).json(await guardarMelhorias(req.body?.canais));
    if (req.method === 'GET') return res.status(200).json(await lerMelhorias());
    return res.status(405).json({ erro: 'Use GET ou POST.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
