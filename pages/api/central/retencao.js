// Retenção dos Shorts (YouTube Analytics).
// POST { itens:[{ videoId, canalId, canal, titulo, publicadoEm, seg, views, retencao, duracaoMedia }] }  (o Compilador manda)
// GET  -> resumo para o Painel: curto x médio por canal e as aberturas que mais/menos seguraram
import { exigirToken } from '../../../lib/central';
import { guardarRetencao, resumoRetencao } from '../../../lib/retencao';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'POST') return res.status(200).json(await guardarRetencao(req.body?.itens));
    if (req.method === 'GET') return res.status(200).json(await resumoRetencao());
    return res.status(405).json({ erro: 'Use GET ou POST.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
