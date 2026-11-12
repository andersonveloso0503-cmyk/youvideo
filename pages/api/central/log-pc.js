// Registro do Compilador: o PC manda o que aconteceu numa tarefa de fundo (ex.: troca de capa no Studio)
// e aparece nos registros da Vercel — assim dá para ver o problema sem estar na frente do PC.
// POST { pc, area, texto }
import { exigirToken } from '../../../lib/central';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const b = req.body || {};
  console.log(`[pc:${String(b.pc || '?').slice(0, 40)}] [${String(b.area || 'geral').slice(0, 30)}] ${String(b.texto || '').slice(0, 800)}`);
  return res.status(200).json({ ok: true });
}
