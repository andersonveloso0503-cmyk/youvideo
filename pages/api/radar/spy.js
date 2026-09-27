// Spy de Canal — cola o @, link do canal ou link de um vídeo e recebe a
// "fórmula" do canal: outliers, melhor dia, frequência, duração e keywords.
import {
  yt, comCache, novoContador, formatarCanal, videosDoCanal, mediana,
  palavrasDominantes, diasDesde, enviarErro,
} from '../../../lib/radar';

export const maxDuration = 120;

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

async function resolverCanal(entrada, contador) {
  const t = entrada.trim();
  const partes = { part: 'snippet,statistics,contentDetails' };

  const idMatch = /(UC[\w-]{22})/.exec(t);
  if (idMatch) return (await yt('channels', { ...partes, id: idMatch[1] }, contador)).items?.[0];

  const video = /(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/.exec(t);
  if (video) {
    const v = await yt('videos', { part: 'snippet', id: video[1] }, contador);
    const cid = v.items?.[0]?.snippet?.channelId;
    if (cid) return (await yt('channels', { ...partes, id: cid }, contador)).items?.[0];
  }

  const handle = /@([\w.\-]+)/.exec(t);
  if (handle) {
    const r = await yt('channels', { ...partes, forHandle: '@' + handle[1] }, contador);
    if (r.items?.[0]) return r.items[0];
  }

  const user = /youtube\.com\/(?:user|c)\/([\w.\-]+)/.exec(t);
  if (user) {
    const r = await yt('channels', { ...partes, forUsername: user[1] }, contador);
    if (r.items?.[0]) return r.items[0];
  }

  // último recurso: pesquisa pelo nome (custa 100 unidades)
  const nome = user?.[1] || handle?.[1] || t;
  const s = await yt('search', { part: 'snippet', type: 'channel', q: nome, maxResults: 1 }, contador);
  const cid = s.items?.[0]?.id?.channelId;
  if (cid) return (await yt('channels', { ...partes, id: cid }, contador)).items?.[0];
  return null;
}

function diaDaSemana(data) {
  const nome = new Date(data).toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nome);
}

function horaBR(data) {
  return +new Date(data).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }) % 24;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { canal: entrada } = req.body || {};
  if (!entrada || !entrada.trim()) return res.status(400).json({ error: 'Cole o @ ou o link do canal' });
  const contador = novoContador();

  try {
    const dados = await comCache(`spy|${entrada.trim().toLowerCase()}`, 6, async () => {
      const bruto = await resolverCanal(entrada, contador);
      if (!bruto) throw new Error('Canal não encontrado. Confira o @ ou o link.');
      const canal = formatarCanal(bruto);
      const videos = await videosDoCanal(canal, 150, contador);
      if (!videos.length) return { canal, vazio: true };

      const views = videos.map((v) => v.views);
      const med = mediana(views) || 1;
      const media = views.reduce((s, v) => s + v, 0) / views.length;

      const ordenadosData = [...videos].sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));
      const ultimos = ordenadosData.slice(0, 20);
      const intervalo = ultimos.length > 1
        ? (new Date(ultimos[0].publicadoEm) - new Date(ultimos[ultimos.length - 1].publicadoEm)) / 86400000 / (ultimos.length - 1)
        : null;

      // melhor dia: média de views por dia da semana (só dias com 2+ vídeos)
      const porDia = DIAS.map(() => ({ soma: 0, n: 0 }));
      const porHora = {};
      videos.forEach((v) => {
        const d = diaDaSemana(v.publicadoEm);
        if (d >= 0) { porDia[d].soma += v.views; porDia[d].n += 1; }
        const h = horaBR(v.publicadoEm);
        porHora[h] = porHora[h] || { soma: 0, n: 0 };
        porHora[h].soma += v.views; porHora[h].n += 1;
      });
      const dias = porDia.map((x, i) => ({ dia: DIAS[i], media: x.n ? Math.round(x.soma / x.n) : 0, videos: x.n }));
      const melhorDia = [...dias].filter((d) => d.videos >= 2).sort((a, b) => b.media - a.media)[0] || dias.sort((a, b) => b.videos - a.videos)[0];
      const melhorHora = Object.entries(porHora).filter(([, x]) => x.n >= 2).sort((a, b) => b[1].soma / b[1].n - a[1].soma / a[1].n)[0];

      const top = [...videos].sort((a, b) => b.views - a.views);
      const top5 = top.slice(0, 5);
      const shorts = videos.filter((v) => v.duracao <= 60).length;

      return {
        canal,
        analisados: videos.length,
        desempenho: {
          mediaViews: Math.round(media),
          medianaViews: Math.round(med),
          intervaloDias: intervalo ? +intervalo.toFixed(1) : null,
          melhorDia: melhorDia?.dia,
          melhorHora: melhorHora ? `${melhorHora[0]}h` : null,
          duracaoMediaTop5: Math.round(top5.reduce((s, v) => s + v.duracao, 0) / top5.length),
          pctShorts: Math.round((shorts / videos.length) * 100),
          diasDesdeUltimo: +diasDesde(ordenadosData[0].publicadoEm).toFixed(1),
          engajamento: +((top.reduce((s, v) => s + v.likes + v.comentarios, 0) / Math.max(top.reduce((s, v) => s + v.views, 0), 1)) * 100).toFixed(2),
        },
        dias,
        keywords: palavrasDominantes(top.slice(0, 25).map((v) => v.titulo), 12),
        tagsFrequentes: palavrasDominantes(top.slice(0, 25).map((v) => v.tags.join(' ')), 12),
        outliers: top.slice(0, 10).map((v) => ({ ...v, vezesMedia: +(v.views / med).toFixed(1) })),
        recentes: ordenadosData.slice(0, 6),
      };
    });
    return res.status(200).json({ ...dados, cotaUsada: contador.unidades });
  } catch (err) {
    return enviarErro(res, err);
  }
}
