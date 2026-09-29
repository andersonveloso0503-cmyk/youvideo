// Vídeos gerados no Youvideo Compilador (em qualquer PC) que já subiram para a nuvem.
// Assim aparecem na Biblioteca de todos os PCs.
// GET -> { videos: [...] }   POST { pc, pcNome, jobId, titulo, videoUrl, capaUrl, duracao, curto, clima, musicas, categoria }
// DELETE ?id=
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

const COL = 'youvideo_pc_videos';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const col = getDb().collection(COL);
  try {
    if (req.method === 'GET') {
      const snap = await col.orderBy('criadoEm', 'desc').limit(300).get();
      return res.status(200).json({ videos: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!/^https:\/\//.test(String(b.videoUrl || ''))) return res.status(400).json({ erro: 'videoUrl inválido.' });
      const id = `${String(b.pc || 'pc').replace(/[^\w-]/g, '')}_${String(b.jobId || Date.now()).replace(/[^\w-]/g, '')}`.slice(0, 120);
      const lista = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
      await col.doc(id).set(
        {
          pc: String(b.pc || '').slice(0, 60),
          pcNome: String(b.pcNome || '').slice(0, 60),
          jobId: String(b.jobId || '').slice(0, 60),
          titulo: String(b.titulo || 'Vídeo').slice(0, 150),
          videoUrl: b.videoUrl,
          capaUrl: /^https:\/\//.test(String(b.capaUrl || '')) ? b.capaUrl : null,
          duracao: Number(b.duracao) || 0,
          curto: !!b.curto,
          clima: String(b.clima || '').slice(0, 60),
          categoria: String(b.categoria || 'compilacoes').slice(0, 30),
          musicas: lista(b.musicas, 200).map((m) => ({ titulo: String(m.titulo || '').slice(0, 150), inicio: Number(m.inicio) || 0 })),
          criadoEm: b.criadoEm || new Date().toISOString(),
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true, id });
    }
    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ erro: 'Falta o id.' });
      await col.doc(String(req.query.id)).delete();
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
