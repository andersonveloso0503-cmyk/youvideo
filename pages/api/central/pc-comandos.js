// Comandos de um PC para outro (ex.: aprovar um vídeo de Sons para dormir que está esperando no outro computador).
// POST  { pc, acao, i, deNome }          -> cria o comando para o PC "pc"
// GET   ?pc=<id>                          -> comandos pendentes desse PC (o próprio PC busca de minuto em minuto)
// PATCH { id, status: 'feito'|'erro', erro } -> o PC avisa que fez
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

const COL = 'youvideo_pc_comandos';
const ACOES = ['semanaAprovar', 'semanaRecusar', 'semanaContinuar'];

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const col = getDb().collection(COL);
  const limpo = (v, n) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, n);
  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const pc = limpo(b.pc, 60);
      if (!pc || !ACOES.includes(b.acao)) return res.status(400).json({ erro: 'Comando inválido.' });
      const ref = await col.add({
        pc,
        acao: b.acao,
        i: Number.isInteger(Number(b.i)) ? Number(b.i) : null,
        deNome: String(b.deNome || '').slice(0, 60),
        status: 'pendente',
        criadoEm: Date.now(),
      });
      return res.status(200).json({ ok: true, id: ref.id });
    }
    if (req.method === 'GET') {
      const pc = limpo(req.query.pc, 60);
      if (!pc) return res.status(400).json({ erro: 'Falta o pc.' });
      const snap = await col.where('pc', '==', pc).where('status', '==', 'pendente').limit(20).get();
      const umDia = Date.now() - 24 * 3600e3;
      const comandos = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.criadoEm > umDia).sort((a, b) => a.criadoEm - b.criadoEm);
      return res.status(200).json({ comandos });
    }
    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ erro: 'Falta o id.' });
      await col.doc(String(b.id)).update({ status: b.status === 'erro' ? 'erro' : 'feito', erro: b.erro ? String(b.erro).slice(0, 300) : null, feitoEm: Date.now() });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
