// Retenção dos Shorts (YouTube Analytics): o Compilador manda a % assistida de cada Short e aqui
// o site guarda junto com a 1ª frase (a abertura) e o tamanho do roteiro.
// Serve para 2 coisas: o Painel mostra curto x médio, e os roteiros novos aprendem com as aberturas
// que mais seguraram (e evitam o jeito das que menos seguraram).
import { getDb } from './firebase-admin';

export const COLECAO_RETENCAO = 'youvideo_retencao';
const idDoYoutube = (url) => (String(url || '').match(/(?:shorts\/|youtu\.be\/|[?&]v=)([\w-]{11})/) || [])[1] || '';

/** 1ª frase narrada do roteiro (sem [pausa] e marcações). */
export function aberturaDe(roteiro) {
  const t = String(roteiro?.narracao || roteiro?.cenas?.[0]?.textoNarrado || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (t.match(/^.{8,200}?[.!?](\s|$)/) || [t.slice(0, 160)])[0].trim();
}

/**
 * Guarda a retenção dos Shorts que o Compilador mandou e casa cada um com o vídeo da Fábrica
 * (para saber a abertura, o tipo e o tamanho).
 */
export async function guardarRetencao(itens) {
  const db = getDb();
  const lista = (itens || []).filter((x) => x && /^[\w-]{11}$/.test(String(x.videoId || '')));
  if (!lista.length) return { guardados: 0 };
  // Vídeos da Fábrica dos últimos 60 dias que já subiram (games, política, Brasil)
  const desde = new Date(Date.now() - 60 * 86400e3).toISOString();
  const porVideo = {};
  for (const campo of ['games', 'politica', 'brasil']) {
    const snap = await db.collection('youvideo_fila').where(campo, '==', true).get().catch(() => null);
    for (const d of snap?.docs || []) {
      const x = d.data();
      if (String(x.criadoEm || '') < desde) continue;
      const vid = x.fabrica?.youtubeId || idDoYoutube(x.fabrica?.youtube?.url);
      if (vid) porVideo[vid] = { x, tipo: campo };
    }
  }
  const lote = db.batch();
  let guardados = 0;
  for (const it of lista.slice(0, 200)) {
    const m = porVideo[it.videoId];
    const seg = Number(it.seg) || 0;
    lote.set(
      db.collection(COLECAO_RETENCAO).doc(it.videoId),
      {
        videoId: it.videoId,
        canalId: String(it.canalId || ''),
        canal: String(it.canal || '').slice(0, 80),
        titulo: String(it.titulo || '').slice(0, 120),
        publicadoEm: it.publicadoEm || null,
        seg,
        views: Number(it.views) || 0,
        retencao: Number(it.retencao) || 0, // % média assistida (pode passar de 100 em Short que repete)
        duracaoMedia: Number(it.duracaoMedia) || 0, // segundos assistidos em média
        tamanho: m?.x?.tamanho || (seg && seg <= 40 ? 'curto' : 'medio'),
        tipo: m?.tipo || null,
        abertura: m ? aberturaDe(m.x.roteiro) : null,
        notaNoticia: m?.x?.notaNoticia ?? null,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );
    guardados++;
  }
  await lote.commit();
  return { guardados, casados: lista.filter((x) => porVideo[x.videoId]).length };
}

/** Resumo para o Painel: por canal, curto x médio, e as aberturas que mais e menos seguraram. */
export async function resumoRetencao() {
  const snap = await getDb().collection(COLECAO_RETENCAO).get();
  const desde = Date.now() - 45 * 86400e3;
  const todos = snap.docs.map((d) => d.data()).filter((x) => x.views >= 50 && Date.parse(x.publicadoEm || 0) > desde);
  const media = (xs) => (xs.length ? Math.round((xs.reduce((n, x) => n + x.retencao, 0) / xs.length) * 10) / 10 : null);
  const canais = {};
  for (const x of todos) {
    const c = (canais[x.canalId] ||= { canalId: x.canalId, canal: x.canal, curto: [], medio: [] });
    c[x.tamanho === 'curto' ? 'curto' : 'medio'].push(x);
  }
  const porCanal = Object.values(canais).map((c) => ({
    canalId: c.canalId,
    canal: c.canal,
    curto: { qtd: c.curto.length, retencao: media(c.curto) },
    medio: { qtd: c.medio.length, retencao: media(c.medio) },
  }));
  const comAbertura = todos.filter((x) => x.abertura).sort((a, b) => b.retencao - a.retencao);
  const enxuto = (x) => ({ videoId: x.videoId, titulo: x.titulo, canal: x.canal, abertura: x.abertura, retencao: x.retencao, seg: x.seg, tamanho: x.tamanho, views: x.views });
  return {
    porCanal,
    melhores: comAbertura.slice(0, 5).map(enxuto),
    piores: comAbertura.slice(-5).reverse().map(enxuto),
    videos: todos.sort((a, b) => String(b.publicadoEm).localeCompare(String(a.publicadoEm))).slice(0, 60).map(enxuto),
    atualizadoEm: snap.docs.reduce((m, d) => (d.data().atualizadoEm > m ? d.data().atualizadoEm : m), ''),
  };
}

const _cache = {};
/**
 * Trecho para o prompt do roteiro: as aberturas que mais seguraram as pessoas neste tipo de canal
 * (e as que menos seguraram). Vazio enquanto não houver dados suficientes (8 Shorts com 200+ views).
 */
export async function aberturasQueSeguram(tipo) {
  const c = _cache[tipo];
  if (c && Date.now() - c.em < 3600e3) return c.texto;
  let texto = '';
  try {
    const snap = await getDb().collection(COLECAO_RETENCAO).where('tipo', '==', tipo).get();
    const xs = snap.docs
      .map((d) => d.data())
      .filter((x) => x.abertura && x.views >= 200 && Date.parse(x.publicadoEm || 0) > Date.now() - 60 * 86400e3)
      .sort((a, b) => b.retencao - a.retencao);
    if (xs.length >= 8) {
      const bons = xs.slice(0, 4);
      const ruins = xs.slice(-3);
      texto =
        ' APRENDA COM O CANAL (dados reais de retenção dos últimos Shorts): estas aberturas SEGURARAM mais as pessoas — ' +
        bons.map((x) => `"${x.abertura}" (${Math.round(x.retencao)}% assistido)`).join('; ') +
        '. Estas seguraram MENOS — ' +
        ruins.map((x) => `"${x.abertura}" (${Math.round(x.retencao)}%)`).join('; ') +
        '. Escreva a 1ª frase no estilo das que seguraram (sem copiar), nunca no estilo das que perderam gente.';
    }
  } catch {
    /* sem dados: segue sem */
  }
  _cache[tipo] = { em: Date.now(), texto };
  return texto;
}
