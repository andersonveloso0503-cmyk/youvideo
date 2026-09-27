// Busca com Radar Score — procura vídeos de um nicho e ordena pelos que
// estouraram pro tamanho do canal.
import { buscarVideos, comCache, novoContador, radarScore, enviarErro } from '../../../lib/radar';

export const maxDuration = 120;

const PERIODOS = { hoje: 1, semana: 7, mes: 30, '3meses': 90, '6meses': 180, ano: 365 };
const IDADE_CANAL = { '1mes': 30, '3meses': 90, '6meses': 180, '1ano': 365 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const {
    q, idioma = 'pt', duracao = 'any', minSeg, maxSeg, periodo = 'mes',
    viewsMin, inscritosMin, inscritosMax, idadeCanal = 'qualquer', ordem = 'score', paginas = 1,
  } = req.body || {};
  if (!q || !q.trim()) return res.status(400).json({ error: 'Digite um nicho ou palavra-chave' });

  const contador = novoContador();
  const dias = PERIODOS[periodo];
  // arredonda pro dia pra o cache funcionar entre buscas iguais no mesmo dia
  const publishedAfter = dias ? new Date(new Date().setUTCHours(0, 0, 0, 0) - dias * 86400000).toISOString() : undefined;

  try {
    const base = await comCache(`busca|${q.trim().toLowerCase()}|${idioma}|${duracao}|${publishedAfter}|${paginas}`, 6, async () => {
      const { videos, canais } = await buscarVideos(
        { q: q.trim(), idioma, videoDuration: duracao, publishedAfter, paginas: Math.min(+paginas || 1, 2) },
        contador
      );
      return { videos, canais };
    });

    const idadeMax = IDADE_CANAL[idadeCanal];
    let lista = base.videos.map((v) => {
      const c = base.canais[v.canalId] || {};
      return {
        ...v,
        canal: {
          id: c.id, nome: c.nome || v.canalNome, thumb: c.thumb, handle: c.handle,
          inscritos: c.inscritos || 0, criadoEm: c.criadoEm, idadeDias: c.idadeDias,
        },
        multiplo: +(v.views / Math.max(c.inscritos || 0, 100)).toFixed(1),
        score: radarScore({ views: v.views, inscritos: c.inscritos, viewsPorDia: v.viewsPorDia, idadeCanalDias: c.idadeDias }),
      };
    });

    lista = lista.filter((v) => {
      if (minSeg && v.duracao < +minSeg) return false;
      if (maxSeg && v.duracao > +maxSeg) return false;
      if (viewsMin && v.views < +viewsMin) return false;
      if (inscritosMin && v.canal.inscritos < +inscritosMin) return false;
      if (inscritosMax && v.canal.inscritos > +inscritosMax) return false;
      if (idadeMax && (v.canal.idadeDias ?? 99999) > idadeMax) return false;
      return true;
    });

    const ordens = {
      score: (a, b) => b.score - a.score,
      views: (a, b) => b.views - a.views,
      viewsDia: (a, b) => b.viewsPorDia - a.viewsPorDia,
      multiplo: (a, b) => b.multiplo - a.multiplo,
      recentes: (a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm),
      inscritos: (a, b) => a.canal.inscritos - b.canal.inscritos,
    };
    lista.sort(ordens[ordem] || ordens.score);

    return res.status(200).json({
      videos: lista,
      total: lista.length,
      cotaUsada: contador.unidades,
      doCache: base.doCache,
      atualizadoEm: base.atualizadoEm,
    });
  } catch (err) {
    return enviarErro(res, err);
  }
}
