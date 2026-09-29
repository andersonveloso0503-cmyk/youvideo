// A fila de cada PC com o Youvideo Compilador, para acompanhar de outro computador.
// PUT { pc, pcNome, jobs: [...] }  (cada PC manda a sua de tempos em tempos)
// GET -> { pcs: [{ pc, pcNome, atualizadoEm, jobs }] }
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

const COL = 'youvideo_pc_filas';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const col = getDb().collection(COL);
  try {
    if (req.method === 'GET') {
      const snap = await col.get();
      const limite = Date.now() - 14 * 24 * 3600e3;
      const pcs = snap.docs.map((d) => ({ pc: d.id, ...d.data() })).filter((p) => (p.atualizadoEm || 0) > limite);
      return res.status(200).json({ pcs });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const b = req.body || {};
      const pc = String(b.pc || '').replace(/[^\w-]/g, '').slice(0, 60);
      if (!pc) return res.status(400).json({ erro: 'Falta o pc.' });
      const txt = (v, n) => String(v ?? '').slice(0, n);
      const jobs = (Array.isArray(b.jobs) ? b.jobs : []).slice(0, 40).map((j) => ({
        id: txt(j.id, 40),
        tipo: txt(j.tipo, 20),
        nome: txt(j.nome, 150),
        status: txt(j.status, 20),
        etapa: txt(j.etapa, 150),
        progresso: Math.max(0, Math.min(1, Number(j.progresso) || 0)),
        restanteSeg: Number(j.restanteSeg) || null,
        duracao: Number(j.duracao) || 0,
        erro: j.erro ? txt(j.erro, 300) : null,
        criadoEm: txt(j.criadoEm, 40),
        concluidoEm: j.concluidoEm ? txt(j.concluidoEm, 40) : null,
        nuvem: j.nuvem ? txt(j.nuvem, 40) : null,
      }));
      await col.doc(pc).set({ pcNome: txt(b.pcNome, 60), atualizadoEm: Date.now(), jobs });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
