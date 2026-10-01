// GET /api/central/biblioteca  (header x-central-token)
// Junta todos os vídeos feitos no Youvideo, separados por categoria.
import { list } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken, categoriaDoProjeto, paraIso, ehCurto, CATEGORIAS } from '../../../lib/central';

export const config = { maxDuration: 60 };

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

async function projetos(db) {
  const snap = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(400).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.videoUrl)
    .map((p) => ({
      chave: `projeto:${p.id}`,
      origem: 'projeto',
      id: p.id,
      categoria: categoriaDoProjeto(p),
      titulo: p.titulo || p.tema || 'Sem título',
      descricao: p.descricao || '',
      videoUrl: p.videoUrl,
      thumbnailUrl: p.thumbnailUrl || null,
      curto: ehCurto(p.formato),
      criadoEm: paraIso(p.criadoEm),
      publicado: {
        youtube: !!p.youtubeVideoId,
        facebook: !!p.redesSociais?.facebook?.id,
        instagram: !!p.redesSociais?.instagram?.id,
      },
    }));
}

async function medleys(db) {
  const snap = await db.collection('youvideo_medley').limit(200).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.videoUrl)
    .map((m) => ({
      chave: `medley:${m.id}`,
      origem: 'medley',
      id: m.id,
      categoria: m.categoria && CATEGORIAS[m.categoria] ? m.categoria : 'medleys',
      titulo: m.titulo || 'Medley',
      estilo: typeof m.estilo === 'string' ? m.estilo : '',
      descricao: m.descricao || '',
      videoUrl: m.videoUrl,
      thumbnailUrl: m.thumbnailUrl || null,
      curto: ehCurto(m.formato),
      criadoEm: paraIso(m.criadoEm),
      publicado: { youtube: !!(m.youtubeVideoId || m.youtubeId) },
    }));
}

async function musicasFila(db) {
  // Músicas da fila que já têm vídeo pronto mas ainda não viraram "projeto"
  const snap = await db.collection('youvideo_musica_fila').limit(200).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.videoUrl && m.status !== 'concluido')
    .map((m) => ({
      chave: `musica:${m.id}`,
      origem: 'musica',
      id: m.id,
      categoria: m.categoria && CATEGORIAS[m.categoria] ? m.categoria : 'musicas',
      titulo: m.titulo || 'Música',
      estilo: m.estilo || '', // gênero da música: a IA do título usa
      descricao: m.letra ? String(m.letra).slice(0, 1500) : '',
      videoUrl: m.videoUrl,
      thumbnailUrl: m.thumbnailUrl || null,
      curto: ehCurto(m.formato),
      criadoEm: paraIso(m.criadoEm),
      publicado: {},
    }));
}

async function covers() {
  if (!BLOB_TOKEN) return [];
  const { blobs } = await list({ prefix: 'cover/projetos/', limit: 1000, token: BLOB_TOKEN });
  const recentes = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 80);
  const itens = await Promise.all(
    recentes.map(async (b) => {
      try {
        return await (await fetch(b.url, { cache: 'no-store' })).json();
      } catch {
        return null;
      }
    })
  );
  return itens
    .filter((c) => c && (c.coverUrl || c.instrumentalUrl))
    .map((c) => ({
      chave: `cover:${c.id}`,
      origem: 'cover',
      id: c.id,
      categoria: 'cover',
      titulo: c.titulo || 'Cover',
      descricao: c.tipo === 'separar' ? 'Instrumental separado' : [c.vozNome, c.estilo].filter(Boolean).join(' · '),
      audioUrl: c.coverUrl || c.instrumentalUrl,
      audioTipo: c.tipo === 'separar' ? 'instrumental' : 'cover',
      criadoEm: paraIso(c.criadoEm),
      publicado: {},
    }));
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    const db = getDb();
    const partes = await Promise.allSettled([projetos(db), medleys(db), musicasFila(db), covers()]);
    const itens = partes.flatMap((p) => (p.status === 'fulfilled' ? p.value : []));
    const avisos = partes.filter((p) => p.status === 'rejected').map((p) => p.reason?.message);
    itens.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    return res.status(200).json({ categorias: CATEGORIAS, itens, avisos });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
