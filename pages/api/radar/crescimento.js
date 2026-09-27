// Canais em Crescimento — canais pequenos com muitas views por vídeo pro
// tamanho que têm. Outlier Score = média de views por vídeo ÷ inscritos.
import {
  buscarVideos, comCache, novoContador, videosDoCanal, enviarErro, diasDesde,
} from '../../../lib/radar';

export const maxDuration = 300;

const NICHOS_PADRAO = {
  tudo: 'música',
  musica: 'música',
  ia: 'música ia',
};

const DECOLAGEM = {
  qualquer: null,
  acelerando: null, // filtrado pela tendência de views, não pela idade
  '3meses': [0, 90],
  '3a5meses': [90, 150],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const {
    q, categoria = 'tudo', idioma = 'pt', duracao = 'any', minSeg, maxSeg,
    decolagem = 'qualquer', inscritosMax = 100000, embaralhar = false,
  } = req.body || {};

  const termo = (q && q.trim()) || NICHOS_PADRAO[categoria] || 'música';
  const busca = categoria === 'ia' && q && !/\b(ia|ai)\b/i.test(q) ? `${termo} ia` : termo;
  const contador = novoContador();
  const hoje = new Date(new Date().setUTCHours(0, 0, 0, 0));
  const publishedAfter = new Date(hoje - 60 * 86400000).toISOString();

  try {
    const dados = await comCache(`crescimento|${busca.toLowerCase()}|${idioma}|${duracao}|${hoje.toISOString()}`, 12, async () => {
      const { videos, canais } = await buscarVideos(
        { q: busca, idioma, videoDuration: duracao, publishedAfter, paginas: 2 },
        contador
      );

      // agrupa por canal e pré-seleciona os que mais se destacam pro tamanho
      const porCanal = {};
      videos.forEach((v) => {
        const c = canais[v.canalId];
        if (!c || c.inscritosOcultos) return;
        (porCanal[c.id] = porCanal[c.id] || { canal: c, views: 0 }).views += v.views;
      });
      const candidatos = Object.values(porCanal)
        .filter((x) => x.canal.inscritos <= 500000 && x.canal.totalVideos >= 2)
        .map((x) => ({ ...x, pre: x.views / Math.max(x.canal.inscritos, 100) }))
        .sort((a, b) => b.pre - a.pre)
        .slice(0, 16);

      const resultado = [];
      for (const { canal } of candidatos) {
        const vids = await videosDoCanal(canal, 20, contador);
        if (!vids.length) continue;
        const media = vids.reduce((s, v) => s + v.views, 0) / vids.length;
        // tendência: views/dia dos 5 mais novos x os 5 anteriores
        const ordenados = [...vids].sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));
        const vpd = (arr) => arr.reduce((s, v) => s + v.views / diasDesde(v.publicadoEm), 0) / Math.max(arr.length, 1);
        const novos = ordenados.slice(0, 5);
        const antigos = ordenados.slice(5, 10);
        const tendencia = antigos.length >= 3 ? Math.round((vpd(novos) / Math.max(vpd(antigos), 1) - 1) * 100) : null;
        const ultimoPost = ordenados[0]?.publicadoEm;

        resultado.push({
          canal,
          mediaViews: Math.round(media),
          outlierScore: +(media / Math.max(canal.inscritos, 100)).toFixed(1),
          tendencia,
          diasDesdeUltimo: ultimoPost ? +diasDesde(ultimoPost).toFixed(1) : null,
          novoNoRadar: canal.idadeDias <= 90,
          // barrinhas: views dos últimos 10 vídeos em ordem cronológica
          historico: ordenados.slice(0, 10).reverse().map((v) => v.views),
          topVideos: [...vids].sort((a, b) => b.views - a.views).slice(0, 6),
        });
      }
      return { canais: resultado, termo: busca };
    });

    let lista = dados.canais.filter((x) => {
      if (inscritosMax && x.canal.inscritos > +inscritosMax) return false;
      const faixa = DECOLAGEM[decolagem];
      if (faixa && (x.canal.idadeDias < faixa[0] || x.canal.idadeDias > faixa[1])) return false;
      if (decolagem === 'acelerando' && !(x.tendencia > 20)) return false;
      if (minSeg || maxSeg) {
        const durMedia = x.topVideos.reduce((s, v) => s + v.duracao, 0) / Math.max(x.topVideos.length, 1);
        if (minSeg && durMedia < +minSeg) return false;
        if (maxSeg && durMedia > +maxSeg) return false;
      }
      return true;
    });
    lista.sort((a, b) => b.outlierScore - a.outlierScore);
    if (embaralhar) lista = lista.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

    return res.status(200).json({
      canais: lista,
      termo: dados.termo,
      cotaUsada: contador.unidades,
      doCache: dados.doCache,
      atualizadoEm: dados.atualizadoEm,
    });
  } catch (err) {
    return enviarErro(res, err);
  }
}
