// Limpeza automática dos vídeos antigos (combinada com o dono em 06/10/2026).
// Regra: apaga sozinho o vídeo que (1) tem mais de 30 dias, (2) já está no YouTube e
// (3) não tem post esperando em nenhuma rede. Apagar não tem volta — por isso a limpeza
// só roda de verdade depois de ligada na página /limpeza, que mostra antes o que seria apagado.
// Os arquivos que estão no PC (pasta de vídeos) nunca são tocados.
import { del } from '@vercel/blob';
import { paraIso } from './central';

export const DIAS = 30;
const MAX_POR_VEZ = 20; // por dia: se tiver mais, continua no dia seguinte
const TOKENS = [process.env.MEDIA_READ_WRITE_TOKEN, process.env.BLOB_READ_WRITE_TOKEN].filter(Boolean);
const ehBlob = (u) => typeof u === 'string' && /\.blob\.vercel-storage\.com\//.test(u);
const config = (db) => db.collection('youvideo_central').doc('limpeza');

export async function lerConfig(db) {
  const d = await config(db).get();
  return { ligada: false, historico: [], ...(d.exists ? d.data() : {}) };
}

export async function ligar(db, ligada) {
  await config(db).set({ ligada: !!ligada, mudouEm: new Date().toISOString() }, { merge: true });
}

/** Links de vídeo que ainda têm post esperando (agendado para os últimos 7 dias ou para a frente). */
async function linksComPostPendente(db) {
  const desde = new Date(Date.now() - 7 * 24 * 3600e3).toISOString();
  const snap = await db.collection('youvideo_agenda').where('quando', '>=', desde).get();
  const usados = new Set();
  for (const d of snap.docs) {
    const a = d.data();
    const falta = Object.values(a.redes || {}).some((r) => !['ok', 'erro'].includes(r?.status));
    if (falta && a.videoUrl) usados.add(a.videoUrl);
  }
  return usados;
}

/**
 * Lista o que a regra manda apagar hoje. Não apaga nada.
 * Cada item: { tipo, titulo, criadoEm, videoUrl, refs: [docs para apagar], limpar: [docs para só tirar o vídeo], blobs: [links] }
 */
export async function candidatos(db) {
  const corte = new Date(Date.now() - DIAS * 24 * 3600e3).toISOString();
  const pendentes = await linksComPostPendente(db);
  const vistos = new Set();
  const lista = [];
  const entra = (item) => {
    if (!item.videoUrl || vistos.has(item.videoUrl) || pendentes.has(item.videoUrl)) return;
    vistos.add(item.videoUrl);
    lista.push(item);
  };

  // 1) Vídeos da Fábrica que já subiram no YouTube (entre 30 e 120 dias atrás)
  const fab = await db
    .collection('youvideo_fila')
    .where('fabrica.quando', '>=', new Date(Date.now() - 120 * 24 * 3600e3).toISOString())
    .where('fabrica.quando', '<=', corte)
    .get();
  for (const d of fab.docs) {
    const x = d.data();
    if (x.fabrica?.youtube?.status !== 'ok' || !x.videoUrl) continue;
    const cenas = (Array.isArray(x.arquivos) ? x.arquivos : []).flatMap((a) => [a?.imageUrl, a?.videoUrl]);
    const audios = [x.narracao?.audioUrl, ...(Array.isArray(x.narracao?.audioSegments) ? x.narracao.audioSegments.map((s) => s?.url || s?.audioUrl) : [])];
    entra({
      tipo: 'Fábrica', titulo: x.roteiro?.titulo || x.tema || 'Vídeo da Fábrica', criadoEm: x.fabrica.quando, videoUrl: x.videoUrl,
      refs: [d.ref], limpar: [], blobs: [x.videoUrl, x.thumbnailUrl, ...cenas, ...audios].filter(ehBlob), buscarProjeto: true,
    });
  }

  // 2) Vídeos da Biblioteca (feitos pelas ferramentas) que já foram anotados como enviados ao YouTube
  const proj = await db.collection('youvideo_projects').where('youtubeVideoId', '>', '').limit(300).get();
  for (const d of proj.docs) {
    const p = d.data();
    const criado = paraIso(p.criadoEm);
    if (!criado || criado > corte || !p.videoUrl) continue;
    entra({ tipo: 'Biblioteca', titulo: p.titulo || p.tema || 'Vídeo', criadoEm: criado, videoUrl: p.videoUrl, refs: [d.ref], limpar: [], blobs: [p.videoUrl, p.thumbnailUrl].filter(ehBlob) });
  }

  // 3) Medleys e vídeos de música: tira só o VÍDEO (a música e a ficha continuam guardadas)
  for (const [col, tipo] of [['youvideo_medley', 'Medley'], ['youvideo_musica_fila', 'Música']]) {
    const snap = await db.collection(col).where('youtubeVideoId', '>', '').limit(150).get();
    for (const d of snap.docs) {
      const m = d.data();
      const criado = paraIso(m.criadoEm);
      if (!criado || criado > corte || !m.videoUrl) continue;
      entra({ tipo, titulo: m.titulo || tipo, criadoEm: criado, videoUrl: m.videoUrl, refs: [], limpar: [d.ref], blobs: [m.videoUrl].filter(ehBlob) });
    }
  }

  lista.sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm))); // mais antigos primeiro
  return lista;
}

async function apagarBlobs(links) {
  const unicos = [...new Set(links)].filter(ehBlob);
  if (!unicos.length) return;
  // Os arquivos podem estar em dois depósitos (chaves diferentes): tenta nos dois
  for (const token of TOKENS) await del(unicos, { token }).catch(() => {});
}

/** Apaga de verdade (até MAX_POR_VEZ por chamada) e anota no histórico. */
export async function rodar(db) {
  const todos = await candidatos(db);
  const lote = todos.slice(0, MAX_POR_VEZ);
  const apagados = [];
  for (const item of lote) {
    try {
      const refs = [...item.refs];
      // Registro do mesmo vídeo em outros lugares (projeto da Fábrica, agenda antiga, lista de vídeos do PC)
      const [projs, agenda, doPc] = await Promise.all([
        item.buscarProjeto ? db.collection('youvideo_projects').where('videoUrl', '==', item.videoUrl).get() : { docs: [] },
        db.collection('youvideo_agenda').where('videoUrl', '==', item.videoUrl).get(),
        db.collection('youvideo_pc_videos').where('videoUrl', '==', item.videoUrl).get(),
      ]);
      const blobs = [...item.blobs];
      for (const p of projs.docs) {
        refs.push(p.ref);
        if (ehBlob(p.data().thumbnailUrl)) blobs.push(p.data().thumbnailUrl);
      }
      for (const a of agenda.docs) refs.push(a.ref);
      for (const v of doPc.docs) refs.push(v.ref);
      await apagarBlobs(blobs);
      await Promise.all(item.limpar.map((r) => r.update({ videoUrl: null, videoApagadoEm: new Date().toISOString() })));
      await Promise.all(refs.map((r) => r.delete()));
      apagados.push({ tipo: item.tipo, titulo: String(item.titulo).slice(0, 90), criadoEm: item.criadoEm });
    } catch (e) {
      apagados.push({ tipo: item.tipo, titulo: String(item.titulo).slice(0, 90), erro: String(e.message).slice(0, 120) });
    }
  }
  const cfg = await lerConfig(db);
  const registro = { em: new Date().toISOString(), apagados: apagados.filter((a) => !a.erro).length, faltam: todos.length - lote.length, itens: apagados.slice(0, 30) };
  await config(db).set({ historico: [registro, ...(cfg.historico || [])].slice(0, 15) }, { merge: true });
  return registro;
}

export const resumo = (item) => ({ tipo: item.tipo, titulo: String(item.titulo).slice(0, 90), criadoEm: item.criadoEm });
