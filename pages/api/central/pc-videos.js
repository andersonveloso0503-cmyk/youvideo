// Vídeos gerados no Youvideo Compilador (em qualquer PC) que já subiram para a nuvem.
// Assim aparecem na Biblioteca de todos os PCs.
// GET -> { videos: [...] }   POST { pc, pcNome, jobId, titulo, videoUrl, capaUrl, duracao, curto, clima, musicas, categoria }
// DELETE ?id=
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { del } from '@vercel/blob';

const COL = 'youvideo_pc_videos';
// Espaço máximo dos vídeos do PC na nuvem. Passou disso, apaga os mais antigos
// (menos os que ainda têm postagem agendada). O arquivo continua no PC.
const LIMITE_GB = Number(process.env.PC_VIDEOS_LIMITE_GB) || 10;
const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

/** Links que ainda vão ser usados pela agenda das redes (não pode apagar). */
async function linksEmUso(db) {
  const desde = new Date(Date.now() - 45 * 24 * 3600e3).toISOString();
  const snap = await db.collection('youvideo_agenda').where('quando', '>=', desde).get();
  const usados = new Set();
  for (const d of snap.docs) {
    const a = d.data();
    const falta = Object.values(a.redes || {}).some((r) => !['ok', 'erro'].includes(r?.status));
    if (falta && a.videoUrl) usados.add(a.videoUrl);
  }
  return usados;
}

async function limpar(db, col) {
  const snap = await col.orderBy('criadoEm', 'asc').get();
  const docs = snap.docs.map((d) => ({ ref: d.ref, ...d.data() }));
  let total = docs.reduce((a, d) => a + (Number(d.tamanho) || 0), 0);
  const limite = LIMITE_GB * 1024 ** 3;
  if (total <= limite) return { total, apagados: 0 };
  const usados = await linksEmUso(db);
  let apagados = 0;
  for (const d of docs) {
    if (total <= limite * 0.85) break; // deixa uma folga para não apagar a cada vídeo novo
    if (usados.has(d.videoUrl)) continue;
    try {
      // Vídeo que veio de um pedido do site: o link é usado pelo site também, só tira da lista
      if (d.subiuPeloPc !== false && BLOB_TOKEN) await del([d.videoUrl, d.capaUrl].filter(Boolean), { token: BLOB_TOKEN });
    } catch {}
    await d.ref.delete();
    total -= Number(d.tamanho) || 0;
    apagados++;
  }
  return { total, apagados };
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const col = getDb().collection(COL);
  try {
    if (req.method === 'GET') {
      const snap = await col.orderBy('criadoEm', 'desc').limit(300).get();
      const videos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const usadoGb = videos.reduce((a, v) => a + (Number(v.tamanho) || 0), 0) / 1024 ** 3;
      return res.status(200).json({ videos, usadoGb, limiteGb: LIMITE_GB });
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
          tamanho: Number(b.tamanho) || 0,
          subiuPeloPc: b.subiuPeloPc !== false,
        },
        { merge: true }
      );
      const limpeza = await limpar(getDb(), col).catch(() => ({ apagados: 0 }));
      return res.status(200).json({ ok: true, id, apagados: limpeza.apagados });
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
