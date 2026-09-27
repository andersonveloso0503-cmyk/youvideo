// Youvideo Radar — funções compartilhadas pelas APIs /api/radar/*
//
// Acesso à YouTube Data API v3:
//   1) Se existir YOUTUBE_API_KEY no Vercel, usa a chave (mais simples).
//   2) Senão, usa o mesmo login OAuth do canal (YOUTUBE_REFRESH_TOKEN), que já
//      tem o escopo youtube.force-ssl e consegue fazer buscas.
// As duas formas gastam a mesma cota do projeto Google Cloud (10.000 unidades/dia).
// Uma busca (search.list) custa 100 unidades; ler vídeos/canais custa 1.
// Por isso tudo passa por um cache no Firestore (coleção radar_cache).

import crypto from 'crypto';
import { getDb } from './firebase-admin';

const API = 'https://www.googleapis.com/youtube/v3';

let tokenCache = { token: null, expira: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expira) return tokenCache.token;
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!refresh || !process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Configure YOUTUBE_API_KEY no Vercel (ou o login do YouTube) pra usar o Radar.');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Não consegui renovar o login do YouTube: ' + (j.error_description || j.error || 'erro'));
  tokenCache = { token: j.access_token, expira: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

const CUSTO = { search: 100, videos: 1, channels: 1, playlistItems: 1 };

// Contador de cota usado na requisição atual (é zerado por quem chama).
export function novoContador() {
  return { unidades: 0 };
}

export async function yt(endpoint, params, contador) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  const headers = {};
  if (process.env.YOUTUBE_API_KEY) qs.set('key', process.env.YOUTUBE_API_KEY);
  else headers.Authorization = `Bearer ${await getAccessToken()}`;

  const r = await fetch(`${API}/${endpoint}?${qs.toString()}`, { headers });
  const j = await r.json();
  if (contador) contador.unidades += CUSTO[endpoint] || 1;
  if (j.error) {
    const motivo = j.error.errors?.[0]?.reason;
    if (motivo === 'quotaExceeded') {
      throw new Error('A cota diária da API do YouTube acabou (10.000 unidades). Ela zera à meia-noite do horário do Pacífico (~4h/5h da manhã no Brasil).');
    }
    throw new Error(`YouTube API: ${j.error.message}`);
  }
  return j;
}

// ---------- Cache no Firestore ----------

export async function comCache(chave, horas, fn) {
  const id = crypto.createHash('sha1').update(chave).digest('hex');
  let db = null;
  try {
    db = getDb();
    const doc = await db.collection('radar_cache').doc(id).get();
    if (doc.exists) {
      const d = doc.data();
      if (d.expira > Date.now()) return { ...JSON.parse(d.json), doCache: true, atualizadoEm: d.criadoEm };
    }
  } catch (e) {
    db = null; // sem Firestore o radar funciona, só não guarda cache
  }
  const dados = await fn();
  const criadoEm = new Date().toISOString();
  if (db) {
    try {
      const json = JSON.stringify(dados);
      if (json.length < 900000) {
        await db.collection('radar_cache').doc(id).set({ json, expira: Date.now() + horas * 3600 * 1000, criadoEm });
      }
    } catch (e) { /* ignora falha de cache */ }
  }
  return { ...dados, doCache: false, atualizadoEm: criadoEm };
}

// ---------- Utilidades ----------

export function duracaoSegundos(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

export function diasDesde(data) {
  return Math.max((Date.now() - new Date(data).getTime()) / 86400000, 0.25);
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function mediana(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Radar Score 0–100: vídeo com muitas views pro tamanho do canal, rápido
// (views por dia) e de canal novo pontua mais alto.
export function radarScore({ views, inscritos, viewsPorDia, idadeCanalDias }) {
  const razao = views / Math.max(inscritos || 0, 100);
  const s1 = clamp(Math.log10(Math.max(razao, 1)) / 2, 0, 1); // 100x inscritos = nota cheia
  const s2 = clamp(Math.log10(Math.max(viewsPorDia, 1)) / 5, 0, 1); // 100 mil views/dia = cheia
  const s3 = idadeCanalDias == null ? 0.3 : idadeCanalDias < 180 ? 1 : idadeCanalDias < 365 ? 0.6 : 0.3;
  return Math.round(100 * (0.5 * s1 + 0.35 * s2 + 0.15 * s3));
}

export const IDIOMAS = {
  pt: { regionCode: 'BR', relevanceLanguage: 'pt' },
  en: { regionCode: 'US', relevanceLanguage: 'en' },
  es: { regionCode: 'MX', relevanceLanguage: 'es' },
  todos: {},
};

// Busca no YouTube já trazendo estatísticas dos vídeos e dos canais.
export async function buscarVideos({ q, idioma = 'pt', videoDuration, publishedAfter, publishedBefore, order = 'viewCount', paginas = 1 }, contador) {
  const ids = [];
  let pageToken;
  for (let p = 0; p < paginas; p++) {
    const r = await yt('search', {
      part: 'snippet',
      type: 'video',
      q,
      maxResults: 50,
      order,
      videoDuration: videoDuration && videoDuration !== 'any' ? videoDuration : undefined,
      publishedAfter,
      publishedBefore,
      pageToken,
      ...(IDIOMAS[idioma] || {}),
    }, contador);
    (r.items || []).forEach((it) => it.id?.videoId && ids.push(it.id.videoId));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  const videos = await detalhesVideos([...new Set(ids)], contador);
  const canais = await detalhesCanais([...new Set(videos.map((v) => v.canalId))], contador);
  return { videos, canais };
}

export async function detalhesVideos(ids, contador) {
  const out = [];
  for (const grupo of chunk(ids, 50)) {
    if (!grupo.length) continue;
    const r = await yt('videos', { part: 'snippet,statistics,contentDetails', id: grupo.join(','), maxResults: 50 }, contador);
    (r.items || []).forEach((v) => {
      const views = +v.statistics?.viewCount || 0;
      out.push({
        id: v.id,
        titulo: v.snippet.title,
        canalId: v.snippet.channelId,
        canalNome: v.snippet.channelTitle,
        publicadoEm: v.snippet.publishedAt,
        thumb: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
        tags: v.snippet.tags || [],
        idioma: v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage || '',
        views,
        likes: +v.statistics?.likeCount || 0,
        comentarios: +v.statistics?.commentCount || 0,
        duracao: duracaoSegundos(v.contentDetails?.duration),
        viewsPorDia: Math.round(views / diasDesde(v.snippet.publishedAt)),
      });
    });
  }
  return out;
}

export async function detalhesCanais(ids, contador) {
  const mapa = {};
  for (const grupo of chunk(ids, 50)) {
    if (!grupo.length) continue;
    const r = await yt('channels', { part: 'snippet,statistics,contentDetails', id: grupo.join(','), maxResults: 50 }, contador);
    (r.items || []).forEach((c) => {
      mapa[c.id] = formatarCanal(c);
    });
  }
  return mapa;
}

export function formatarCanal(c) {
  return {
    id: c.id,
    nome: c.snippet.title,
    handle: c.snippet.customUrl || '',
    thumb: c.snippet.thumbnails?.medium?.url || c.snippet.thumbnails?.default?.url,
    pais: c.snippet.country || '',
    criadoEm: c.snippet.publishedAt,
    idadeDias: Math.round(diasDesde(c.snippet.publishedAt)),
    inscritos: +c.statistics?.subscriberCount || 0,
    inscritosOcultos: !!c.statistics?.hiddenSubscriberCount,
    viewsTotal: +c.statistics?.viewCount || 0,
    totalVideos: +c.statistics?.videoCount || 0,
    uploads: c.contentDetails?.relatedPlaylists?.uploads || ('UU' + c.id.slice(2)),
  };
}

// Últimos vídeos de um canal (via playlist de uploads — 1 unidade por página).
export async function videosDoCanal(canal, limite, contador) {
  const ids = [];
  let pageToken;
  while (ids.length < limite) {
    const r = await yt('playlistItems', { part: 'contentDetails', playlistId: canal.uploads, maxResults: 50, pageToken }, contador);
    (r.items || []).forEach((it) => ids.push(it.contentDetails.videoId));
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return detalhesVideos(ids.slice(0, limite), contador);
}

// ---------- Palavras-chave ----------

const STOP = new Set(`
a o e é de da do das dos em no na nos nas um uma uns umas para pra pro por com sem que se seu sua seus suas meu minha
quem sente mais como todo toda todos todas você voce isso essa esse este esta sobre quando depois antes ainda muito muita pelo pela ser ter foi vai tem tudo nada hoje aqui ali até ate nosso nossa quer era sou são sao está esta estou vou te lhe ele ela eles elas
the of and to in on for with a an is are my your you me it this that at by from as be or not no yes
el la los las y en con por para del al mi tu su lo le que un una es
vs ft feat part parte ep episodio episódio video vídeo videos vídeos oficial official clipe clip music musica música
hd 4k 2024 2025 2026 new novo nova 1 2 3 4 5 10 hora horas hour hours min minutos full completo
`.split(/\s+/).filter(Boolean));

export function palavras(texto) {
  return (texto || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@|()[\]{}"“”'’!?.,:;/\\\-–—_+*=~^<>]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w) && /\p{L}/u.test(w));
}

export function palavrasDominantes(titulos, n = 10) {
  const cont = {};
  titulos.forEach((t) => new Set(palavras(t)).forEach((w) => (cont[w] = (cont[w] || 0) + 1)));
  return Object.entries(cont)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([palavra, vezes]) => ({ palavra, vezes }));
}

// Formata números no estilo 12.3K / 1.2M
export function curto(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(Math.round(n));
}

export function enviarErro(res, err) {
  return res.status(500).json({ error: err.message || String(err) });
}
