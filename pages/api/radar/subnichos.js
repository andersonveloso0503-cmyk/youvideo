// Sub-nichos esquentando — pra cada sub-nicho, compara a média de views/dia
// dos vídeos dos últimos 10 dias com a dos 20 dias anteriores.
// Cada sub-nicho custa ~101 unidades de cota, por isso o resultado fica 24h em cache.
import { buscarVideos, comCache, novoContador, enviarErro } from '../../../lib/radar';

export const maxDuration = 300;

const SUBNICHOS_PADRAO = [
  'lofi', 'piano instrumental', 'sertanejo', 'forró', 'gospel', 'louvor', 'funk',
  'pagode', 'jazz', 'música para dormir', 'rap', 'reggae',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { subnichos, idioma = 'pt' } = req.body || {};
  const lista = (subnichos && subnichos.length ? subnichos : SUBNICHOS_PADRAO)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 15);
  const contador = novoContador();
  const hoje = new Date(new Date().setUTCHours(0, 0, 0, 0)).getTime();
  const d10 = hoje - 10 * 86400000;
  const d30 = new Date(hoje - 30 * 86400000).toISOString();

  try {
    const resultado = [];
    for (const nome of lista) {
      const item = await comCache(`subnicho|${nome.toLowerCase()}|${idioma}|${hoje}`, 24, async () => {
        const { videos } = await buscarVideos({ q: nome, idioma, publishedAfter: d30, paginas: 1 }, contador);
        const novos = videos.filter((v) => new Date(v.publicadoEm).getTime() >= d10);
        const velhos = videos.filter((v) => new Date(v.publicadoEm).getTime() < d10);
        const media = (arr) => arr.reduce((s, v) => s + v.viewsPorDia, 0) / Math.max(arr.length, 1);
        const mNovo = media(novos);
        const mVelho = media(velhos);
        return {
          nome,
          alta: mVelho > 0 ? Math.round((mNovo / mVelho - 1) * 100) : null,
          viewsDiaRecentes: Math.round(mNovo),
          videosRecentes: novos.length,
        };
      });
      resultado.push({ nome: item.nome, alta: item.alta, viewsDiaRecentes: item.viewsDiaRecentes, videosRecentes: item.videosRecentes });
    }
    resultado.sort((a, b) => (b.alta ?? -999) - (a.alta ?? -999));
    return res.status(200).json({ subnichos: resultado, cotaUsada: contador.unidades });
  } catch (err) {
    return enviarErro(res, err);
  }
}
