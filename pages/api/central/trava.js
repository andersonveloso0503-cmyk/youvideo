// Trava simples entre os PCs: só UM Compilador faz uma tarefa de cada vez (ex.: arrumar as playlists do canal),
// para os dois PCs não fazerem a mesma coisa juntos (vídeo duplicado na playlist, cota do YouTube gasta à toa).
// POST { nome, pc, minutos }        -> { ok:true } se a trava é deste PC agora (pega ou renova); { ok:false, dono } se outro PC está com ela
// POST { nome, pc, soltar:true }    -> solta (só o dono)
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const b = req.body || {};
  const nome = String(b.nome || '').replace(/[^\w-]/g, '').slice(0, 60);
  const pc = String(b.pc || '').slice(0, 60);
  if (!nome || !pc) return res.status(400).json({ erro: 'Faltou nome ou pc.' });
  const ref = getDb().collection('youvideo_travas').doc(nome);
  const r = await getDb().runTransaction(async (t) => {
    const d = (await t.get(ref)).data();
    const livre = !d || d.ate < Date.now() || d.pc === pc;
    if (b.soltar) {
      if (d?.pc === pc) t.delete(ref);
      return { ok: true };
    }
    if (!livre) return { ok: false, dono: d.pc, ate: d.ate };
    t.set(ref, { pc, ate: Date.now() + Math.min(240, Math.max(1, Number(b.minutos) || 30)) * 60e3, em: Date.now() });
    return { ok: true };
  });
  return res.status(200).json(r);
}
