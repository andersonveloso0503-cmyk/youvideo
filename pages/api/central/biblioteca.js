// GET /api/central/biblioteca  (header x-central-token)
// Junta todos os vídeos feitos no Youvideo, separados por categoria.
import { list } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken, categoriaDoProjeto, paraIso, ehCurto, CATEGORIAS } from '../../../lib/central';

export const config = { maxDuration: 60 };

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Como cada vídeo está em relação ao YouTube — é o que vira a tarja do cartão na Biblioteca:
 *   publicado  = já está no YouTube (publicado ou agendado lá)
 *   automatico = a Fábrica (ou a fila de músicas) sobe sozinha; não precisa fazer nada
 *   erro       = era para subir sozinho e deu erro
 *   fora       = não vai para o YouTube (vídeo da empresa, ou 2º vídeo do dia da Fábrica)
 *   manual     = ninguém vai subir: precisa marcar e agendar
 */
function youtubeDoProjeto(p, categoria, fab) {
  if (p.youtubeVideoId) return { estado: 'publicado', url: p.youtubeUrl || `https://youtu.be/${p.youtubeVideoId}`, quando: p.youtubeQuando || null, canal: p.youtubeCanal || '' };
  if (categoria === 'empresa') return { estado: 'fora', motivo: 'Vídeo da empresa: vai só para Facebook e Instagram' };
  const f = fab?.fabrica;
  if (f) {
    const st = f.youtube?.status;
    if (st === 'ok') return { estado: 'publicado', url: f.youtube.url || null, quando: f.quandoYoutube || null, canal: f.canalYoutube?.titulo || '' };
    if (f.ativo === false) return { estado: 'manual' }; // tirado da Fábrica antes de subir
    if (!f.redes?.youtube) return { estado: 'fora', motivo: 'A Fábrica manda só 1 vídeo por dia ao YouTube; este vai para as outras redes' };
    if (st === 'erro') return { estado: 'erro', erro: f.youtube.erro || '' };
    return { estado: 'automatico', quando: f.quandoYoutube || null, canal: f.canalYoutube?.titulo || '', motivo: 'A Fábrica sobe sozinha (o Compilador precisa estar aberto)' };
  }
  return { estado: 'manual' };
}

async function projetos(db) {
  const [snap, fabSnap] = await Promise.all([
    db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(400).get(),
    db.collection('youvideo_fila').where('origem', '==', 'fabrica').get().catch(() => ({ docs: [] })),
  ]);
  // Vídeos que vieram da Fábrica: acha pelo endereço do vídeo
  const daFabrica = new Map();
  for (const d of fabSnap.docs) {
    const x = d.data();
    if (x.videoUrl) daFabrica.set(x.videoUrl, x);
  }
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.videoUrl)
    .map((p) => {
      const categoria = categoriaDoProjeto(p);
      const youtube = youtubeDoProjeto(p, categoria, daFabrica.get(p.videoUrl));
      return {
        chave: `projeto:${p.id}`,
        origem: 'projeto',
        id: p.id,
        categoria,
        titulo: p.titulo || p.tema || 'Sem título',
        descricao: p.descricao || '',
        videoUrl: p.videoUrl,
        thumbnailUrl: p.thumbnailUrl || null,
        curto: ehCurto(p.formato),
        criadoEm: paraIso(p.criadoEm),
        daFabrica: daFabrica.has(p.videoUrl),
        youtube,
        publicado: {
          youtube: youtube.estado === 'publicado',
          facebook: !!p.redesSociais?.facebook?.id,
          instagram: !!p.redesSociais?.instagram?.id,
        },
      };
    });
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
      youtube: m.youtubeVideoId || m.youtubeId ? { estado: 'publicado', url: m.youtubeUrl || `https://youtu.be/${m.youtubeVideoId || m.youtubeId}`, quando: m.youtubeQuando || null } : { estado: 'manual' },
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
      youtube: m.youtubeVideoId
        ? { estado: 'publicado', url: m.youtubeUrl || `https://youtu.be/${m.youtubeVideoId}`, quando: m.youtubeQuando || null }
        : m.status === 'renderizado'
          ? { estado: 'automatico', motivo: 'A fila de músicas publica 1 por dia, sozinha' }
          : { estado: 'manual' },
      publicado: { youtube: !!m.youtubeVideoId },
    }));
}

// Onde fica guardado cada tipo de vídeo da Biblioteca (para anotar que ele já subiu no YouTube)
const COLECAO_DA_ORIGEM = { projeto: 'youvideo_projects', medley: 'youvideo_medley', musica: 'youvideo_musica_fila' };

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
    // POST { acao: 'youtube', chave: 'projeto:ID', videoId, url, canal, quando } -> o PC subiu este vídeo no YouTube: anota
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.acao !== 'youtube') return res.status(400).json({ erro: 'Pedido desconhecido.' });
      const [origem, ...resto] = String(b.chave || '').split(':');
      const id = resto.join(':');
      const colecao = COLECAO_DA_ORIGEM[origem];
      if (!colecao || !id || !b.videoId) return res.status(200).json({ ok: false, motivo: 'Este vídeo não fica guardado no site.' });
      const ref = db.collection(colecao).doc(id);
      if (!(await ref.get()).exists) return res.status(200).json({ ok: false, motivo: 'Vídeo não encontrado.' });
      await ref.update({
        youtubeVideoId: String(b.videoId).slice(0, 40),
        youtubeUrl: String(b.url || `https://youtu.be/${b.videoId}`).slice(0, 200),
        youtubeCanal: String(b.canal || '').slice(0, 120),
        youtubeQuando: b.quando ? String(b.quando).slice(0, 40) : null,
      });
      return res.status(200).json({ ok: true });
    }
    const partes = await Promise.allSettled([projetos(db), medleys(db), musicasFila(db), covers()]);
    const itens = partes.flatMap((p) => (p.status === 'fulfilled' ? p.value : []));
    const avisos = partes.filter((p) => p.status === 'rejected').map((p) => p.reason?.message);
    itens.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
    return res.status(200).json({ categorias: CATEGORIAS, itens, avisos });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
