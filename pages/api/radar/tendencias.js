// Tendências — palavras que estão subindo (últimos 10 dias x 20 anteriores),
// canais que mais cresceram e canais novos que acabaram de entrar no radar.
import { buscarVideos, comCache, novoContador, palavras, enviarErro } from '../../../lib/radar';

export const maxDuration = 120;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { q = 'música', idioma = 'pt' } = req.body || {};
  const termo = q.trim() || 'música';
  const contador = novoContador();
  const hoje = new Date(new Date().setUTCHours(0, 0, 0, 0)).getTime();
  const d10 = new Date(hoje - 10 * 86400000).toISOString();
  const d30 = new Date(hoje - 30 * 86400000).toISOString();

  try {
    const dados = await comCache(`tendencias|${termo.toLowerCase()}|${idioma}|${hoje}`, 12, async () => {
      const recente = await buscarVideos({ q: termo, idioma, publishedAfter: d10, paginas: 1 }, contador);
      const anterior = await buscarVideos({ q: termo, idioma, publishedAfter: d30, publishedBefore: d10, paginas: 1 }, contador);

      // peso de cada palavra = soma das views/dia dos vídeos em que aparece
      const pesar = (videos) => {
        const mapa = {};
        let total = 0;
        videos.forEach((v) => {
          total += v.viewsPorDia;
          new Set([...palavras(v.titulo), ...v.tags.slice(0, 8).flatMap((t) => palavras(t))]).forEach((w) => {
            const m = (mapa[w] = mapa[w] || { peso: 0, vezes: 0 });
            m.peso += v.viewsPorDia;
            m.vezes += 1;
          });
        });
        return { mapa, total: Math.max(total, 1) };
      };
      const r = pesar(recente.videos);
      const a = pesar(anterior.videos);
      const keywords = Object.entries(r.mapa)
        .filter(([, m]) => m.vezes >= 2)
        .map(([palavra, m]) => {
          const shareNovo = m.peso / r.total;
          const shareVelho = (a.mapa[palavra]?.peso || 0) / a.total;
          const alta = shareVelho > 0 ? Math.round((shareNovo / shareVelho - 1) * 100) : 999;
          return { palavra, alta, vezes: m.vezes, novo: shareVelho === 0 };
        })
        .filter((k) => k.alta > 0)
        .sort((x, y) => (y.alta === x.alta ? y.vezes - x.vezes : y.alta - x.alta))
        .slice(0, 30);

      // canais: soma de views dos vídeos recentes x inscritos
      const canais = { ...anterior.canais, ...recente.canais };
      const agrupar = {};
      recente.videos.forEach((v) => {
        const c = canais[v.canalId];
        if (!c) return;
        const g = (agrupar[c.id] = agrupar[c.id] || { canal: c, viewsRecentes: 0, videos: 0, melhor: v });
        g.viewsRecentes += v.views;
        g.videos += 1;
        if (v.views > g.melhor.views) g.melhor = v;
      });
      const lista = Object.values(agrupar).map((g) => ({
        canal: g.canal,
        viewsRecentes: g.viewsRecentes,
        videos: g.videos,
        melhorVideo: { id: g.melhor.id, titulo: g.melhor.titulo, views: g.melhor.views },
        crescimento: +(g.viewsRecentes / Math.max(g.canal.inscritos, 100)).toFixed(1),
      }));

      const topGrowers = [...lista]
        .filter((x) => !x.canal.inscritosOcultos)
        .sort((x, y) => y.crescimento - x.crescimento)
        .slice(0, 10);
      const novosNoRadar = [...lista]
        .filter((x) => x.canal.idadeDias <= 45)
        .sort((x, y) => y.viewsRecentes - x.viewsRecentes)
        .slice(0, 10);

      return { keywords, topGrowers, novosNoRadar, termo };
    });

    return res.status(200).json({ ...dados, cotaUsada: contador.unidades });
  } catch (err) {
    return enviarErro(res, err);
  }
}
