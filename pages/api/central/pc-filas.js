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
      // Sons para dormir deste PC (só a lista, para aparecer na Biblioteca dos outros PCs)
      const dormir = (Array.isArray(b.dormir) ? b.dormir : []).slice(0, 80).map((v) => ({
        nome: txt(v.nome, 160),
        titulo: txt(v.titulo, 150),
        duracao: Number(v.duracao) || 0,
        criadoEm: txt(v.criadoEm, 40),
        youtube: v.youtube ? { estado: txt(v.youtube.estado, 20), url: v.youtube.url ? txt(v.youtube.url, 200) : null, quando: v.youtube.quando ? txt(v.youtube.quando, 40) : null } : null,
      }));
      // Semana de Sons para dormir deste PC (para ver e aprovar de outro PC)
      let semana;
      if (b.semana && typeof b.semana === 'object') {
        semana = {
          rodando: !!b.semana.rodando,
          canalNome: txt(b.semana.canalNome, 80),
          dias: (Array.isArray(b.semana.dias) ? b.semana.dias : []).slice(0, 14).map((d) => ({
            i: Number(d.i) || 0,
            nome: txt(d.nome, 100),
            quando: txt(d.quando, 40),
            passo: txt(d.passo, 20),
            etapa: txt(d.etapa, 200),
            erro: d.erro ? txt(d.erro, 300) : '',
            previa: /^https:\/\//.test(String(d.previa || '')) ? txt(d.previa, 400) : null,
            pulado: !!d.pulado,
          })),
        };
      } else if (b.semana === null) semana = null;
      await col.doc(pc).set({ pcNome: txt(b.pcNome, 60), atualizadoEm: Date.now(), jobs, ...(Array.isArray(b.dormir) ? { dormir } : {}), ...(semana !== undefined ? { semana } : {}) }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
