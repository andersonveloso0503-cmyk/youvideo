// "O QUE MELHORAR" (Painel do Compilador): olha os números de 28 dias de cada canal (YouTube Analytics, que o
// Compilador manda) e escreve em português simples o que fazer. Cada dica diz se o sistema já ajusta SOZINHO
// (🤖 — vira regra nos roteiros novos) ou se depende do dono (👤).
import { getDb } from './firebase-admin';
import { COLECAO_RETENCAO } from './retencao';

const DOC = () => getDb().collection('youvideo_config').doc('melhorias');
const CANAIS_CONHECIDOS = { UC_R1BBtu1D49nlJ_f0K5_aA: 'games', UCysp9HjTX966A7T7HTHwCHg: 'politica' };
const NOME_FONTE = {
  SHORTS: 'feed de Shorts',
  YT_SEARCH: 'pesquisa do YouTube',
  RELATED_VIDEO: 'vídeos sugeridos',
  SUBSCRIBER: 'inscritos (página inicial)',
  BROWSE: 'página inicial',
  EXT_URL: 'links de fora',
  NO_LINK_OTHER: 'acesso direto',
  YT_CHANNEL: 'página do canal',
  PLAYLIST: 'playlists',
  NOTIFICATION: 'notificações',
  YT_OTHER_PAGE: 'outras páginas do YouTube',
};
const media = (xs, f) => (xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0);
const r0 = (n) => Math.round(n);
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil` : String(r0(n)));

async function tipoDoCanal(canalId, ids) {
  if (CANAIS_CONHECIDOS[canalId]) return CANAIS_CONHECIDOS[canalId];
  const conta = {};
  for (let i = 0; i < Math.min(ids.length, 30); i += 10) {
    const snap = await getDb().collection(COLECAO_RETENCAO).where('videoId', 'in', ids.slice(i, i + 10)).get().catch(() => null);
    for (const d of snap?.docs || []) if (d.data().tipo) conta[d.data().tipo] = (conta[d.data().tipo] || 0) + 1;
  }
  return Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** Dicas de UM canal a partir dos números. Devolve { dicas:[{icone, texto, auto}], ajustes:{...} } */
function analisar(c, tipo) {
  const dicas = [];
  const ajustes = {};
  const shorts = (c.videos || []).filter((v) => v.seg > 0 && v.seg <= 180 && v.views >= 30);
  const totalViews = Object.values(c.trafego || {}).reduce((a, b) => a + b, 0) || (c.videos || []).reduce((a, v) => a + v.views, 0);

  // 1) Tamanho: Shorts curtos x longos (% assistida e views)
  const curtos = shorts.filter((v) => v.seg <= 45);
  const longos = shorts.filter((v) => v.seg > 45);
  if (curtos.length >= 3 && longos.length >= 3) {
    const rc = media(curtos, (v) => v.retencao);
    const rl = media(longos, (v) => v.retencao);
    const vc = media(curtos, (v) => v.views);
    const vl = media(longos, (v) => v.views);
    if (rc - rl >= 8) {
      dicas.push({ icone: '⏱️', texto: `Shorts de até 45 s seguram ${r0(rc)}% do vídeo; os mais longos, só ${r0(rl)}%. Views médias: ${fmt(vc)} x ${fmt(vl)}.`, acao: 'Os roteiros novos ficam mais curtos e diretos.', auto: true });
      ajustes.curto = true;
    } else if (rl - rc >= 8 && vl >= vc) {
      dicas.push({ icone: '⏱️', texto: `Aqui os Shorts mais longos (mais de 45 s) seguram mais: ${r0(rl)}% contra ${r0(rc)}% dos curtos.`, acao: 'Notícia grande pode ser um pouco mais longa (o sistema já escolhe pelo assunto).', auto: true });
    }
  } else if (tipo === 'politica' && longos.length >= 3 && media(longos, (v) => v.seg) > 70 && media(longos, (v) => v.retencao) < 60) {
    dicas.push({ icone: '⏱️', texto: `Os Shorts estão longos (média de ${r0(media(longos, (v) => v.seg))} s) e seguram só ${r0(media(longos, (v) => v.retencao))}% do vídeo.`, acao: 'Os roteiros novos ficam com no máximo uns 50 segundos.', auto: true });
    ajustes.curto = true;
  }

  // 2) Começo do vídeo: % assistida geral baixa = a pessoa sai logo no início
  if (shorts.length >= 5) {
    const rm = media(shorts, (v) => v.retencao);
    if (rm < 55) dicas.push({ icone: '🎬', texto: `Em média a pessoa assiste ${r0(rm)}% de cada Short: a maioria sai nos primeiros segundos.`, acao: 'A 1ª frase já entra com o fato mais forte (os roteiros aprendem com as aberturas que mais seguraram).', auto: true });
    else if (rm >= 75) dicas.push({ icone: '🎬', texto: `Ótima retenção: em média assistem ${r0(rm)}% de cada Short.`, acao: 'Manter o formato.', auto: true, bom: true });
  }

  // 3) De onde vêm as views
  const fontes = Object.entries(c.trafego || {}).sort((a, b) => b[1] - a[1]);
  if (fontes.length && totalViews > 0) {
    const pBusca = ((c.trafego?.YT_SEARCH || 0) / totalViews) * 100;
    const [top, vTop] = fontes[0];
    if (pBusca >= 25) {
      dicas.push({ icone: '🔎', texto: `${r0(pBusca)}% das views vêm da pesquisa do YouTube.`, acao: 'Os títulos novos começam pelo nome do jogo/pessoa/assunto que as pessoas pesquisam.', auto: true });
      ajustes.tituloBusca = true;
    } else dicas.push({ icone: '📍', texto: `A maior parte das views vem de: ${NOME_FONTE[top] || top} (${r0((vTop / totalViews) * 100)}%).`, acao: top === 'SHORTS' ? 'O feed de Shorts manda quem segura nos primeiros segundos: o começo é o que mais importa.' : '', auto: true, info: true });
  }

  // 4) Assunto que mais trouxe inscritos
  const comInsc = [...(c.videos || [])].filter((v) => v.inscritos > 0).sort((a, b) => b.inscritos - a.inscritos);
  if (comInsc.length) {
    const v = comInsc[0];
    const total = comInsc.reduce((n, x) => n + x.inscritos, 0);
    if (v.inscritos >= 3)
      dicas.push({ icone: '⭐', texto: `"${String(v.titulo).slice(0, 70)}" trouxe ${v.inscritos} inscritos (${r0((v.inscritos / Math.max(1, total)) * 100)}% de todos do mês).`, acao: 'Vale fazer mais vídeos sobre esse assunto: na Fábrica, dê "Fazer agora" nas notícias parecidas.', auto: false, videoId: v.id });
  }

  // 5) Horário de publicação (Brasília): melhor x pior faixa
  const faixa = (iso) => {
    const h = (new Date(iso).getUTCHours() + 21) % 24;
    return h < 6 ? 'madrugada (0h–6h)' : h < 12 ? 'manhã (6h–12h)' : h < 18 ? 'tarde (12h–18h)' : 'noite (18h–24h)';
  };
  const porFaixa = {};
  for (const v of shorts.filter((x) => x.publicadoEm)) (porFaixa[faixa(v.publicadoEm)] ||= []).push(v);
  const fx = Object.entries(porFaixa).filter(([, l]) => l.length >= 3).map(([f, l]) => [f, media(l, (v) => v.views)]).sort((a, b) => b[1] - a[1]);
  if (fx.length >= 2 && fx[0][1] >= fx[fx.length - 1][1] * 1.8)
    dicas.push({ icone: '🕒', texto: `Shorts publicados de ${fx[0][0]} têm em média ${fmt(fx[0][1])} views; de ${fx[fx.length - 1][0]}, só ${fmt(fx[fx.length - 1][1])}.`, acao: `Dá para publicar mais de ${fx[0][0]}: me peça para mudar os horários da Fábrica.`, auto: false });

  // 6) Destaque do mês
  const melhor = [...(c.videos || [])].sort((a, b) => b.views - a.views)[0];
  if (melhor && melhor.views >= 500) dicas.push({ icone: '🏆', texto: `Melhor vídeo do mês: "${String(melhor.titulo).slice(0, 70)}" — ${fmt(melhor.views)} views, ${r0(melhor.retencao)}% assistido.`, acao: '', auto: true, info: true, videoId: melhor.id });

  return { dicas, ajustes };
}

// Canais que o sistema produz sozinho (os ajustes 🤖 viram regra nos roteiros); nos outros a dica é só para você
const AUTOMATICOS = ['games', 'politica', 'brasil'];
const paraVoce = (d) =>
  d.auto && !d.info && !d.bom
    ? { ...d, auto: false, acao: d.icone === '🔎' ? 'Comece os títulos pelo nome que as pessoas pesquisam.' : d.icone === '⏱️' ? 'Faça os Shorts mais curtos e diretos.' : d.icone === '🎬' ? 'Comece com o fato mais forte logo na 1ª frase.' : d.acao }
    : d;

/** Recebe os números do Compilador, guarda as dicas e as regras automáticas por tipo de canal. */
export async function guardarMelhorias(canais) {
  const resultado = [];
  const porTipo = {};
  for (const c of (canais || []).slice(0, 12)) {
    const tipo = await tipoDoCanal(c.canalId, (c.videos || []).map((v) => v.id)).catch(() => null);
    const { dicas: d0, ajustes } = analisar(c, tipo);
    const dicas = AUTOMATICOS.includes(tipo) ? d0 : d0.map(paraVoce);
    resultado.push({ canalId: c.canalId, canal: String(c.canal || '').slice(0, 80), tipo, de: c.de, ate: c.ate, dicas });
    if (tipo && Object.keys(ajustes).length) porTipo[tipo] = { ...(porTipo[tipo] || {}), ...ajustes };
  }
  const doc = { canais: resultado, porTipo, em: new Date().toISOString() };
  await DOC().set(doc);
  _cache.em = 0;
  return doc;
}

export async function lerMelhorias() {
  return (await DOC().get()).data() || { canais: [], porTipo: {} };
}

const _cache = { em: 0, d: null };
/** Trecho para o prompt do roteiro com as regras que os números pediram (🤖 automático). */
export async function ajustesDoCanal(tipo) {
  if (!_cache.d || Date.now() - _cache.em > 3600e3) {
    _cache.d = await lerMelhorias().catch(() => ({ porTipo: {} }));
    _cache.em = Date.now();
  }
  const a = _cache.d?.porTipo?.[tipo] || {};
  let t = '';
  if (a.curto) t += ' DADOS DO CANAL: os Shorts curtos seguram muito mais as pessoas. Escreva no MÁXIMO 120 palavras no total (uns 50 segundos), mesmo que outra regra peça mais; corte contexto e repetição, mantendo a explicação clara.';
  if (a.tituloBusca) t += ' DADOS DO CANAL: muita gente chega pela pesquisa do YouTube. O título começa pelo nome principal que as pessoas pesquisam (o jogo, a pessoa ou o assunto), sem enrolação antes.';
  return t;
}
