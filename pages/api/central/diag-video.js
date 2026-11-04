// Diagnóstico de um vídeo da Fábrica: GET ?q=<parte do título>&token=SENHA
// Mostra, para os vídeos com esse título: se a IA escolheu ilustrações, quantas cenas, se a receita levou as ilustrações
// e qual PC (e versão do Compilador) montou.
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { COLECAO } from '../../../lib/montarPc';

export const config = { maxDuration: 120 };

const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const q = sem(req.query.q);
  if (q.length < 3) return res.status(400).json({ erro: 'Passe ?q= com um pedaço do título (3 letras ou mais).' });
  const db = getDb();
  try {
    const desde = new Date(Date.now() - 4 * 86400e3).toISOString();
    const fila = (await db.collection('youvideo_fila').where('criadoEm', '>=', desde).get()).docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => sem(d.tema).includes(q) || sem(d.roteiro?.titulo).includes(q))
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
      .slice(0, 5);
    const videos = [];
    for (const d of fila) {
      const cenas = d.roteiro?.cenas || [];
      const arquivos = d.arquivos || [];
      const rid = String(d.renderId || '').replace(/^pc:/, '');
      const pd = rid ? await db.collection(COLECAO).doc(rid).get() : null;
      const meus = pd?.exists ? [{ id: pd.id, ...pd.data() }] : [];
      const resumoPedido = [];
      for (const p of meus) {
        let receita = null;
        try {
          receita = p.receita ? JSON.parse(p.receita) : p.receitaUrl ? await (await fetch(p.receitaUrl)).json() : null;
        } catch {}
        resumoPedido.push({
          criado: new Date(p.criadoEm || 0).toISOString(),
          status: p.status,
          pc: p.pc || '',
          versaoPc: p.versaoPc || '(não informada — Compilador antigo)',
          clipes: receita?.clipes?.length ?? null,
          clipesComIlustracao: receita ? receita.clipes.filter((c) => c.ilustracao).length : null,
          erro: p.erro || '',
        });
      }
      videos.push({
        id: d.id,
        criadoEm: d.criadoEm,
        refeitoDe: d.refeitoDe || null,
        status: d.status,
        formato: d.formato,
        politica: !!d.politica,
        midiasPlanejadas: !!d.midiasPlanejadas,
        cenas: cenas.length,
        cenasComIlustracao: cenas.filter((c) => c.ilustracao).length,
        tiposDeIlustracao: cenas.filter((c) => c.ilustracao).map((c) => c.ilustracao.tipo),
        arquivosComIlustracao: arquivos.filter((a) => a.ilustracao).length,
        infoIlustracoes: d.infoIlustracoes || '(vídeo planejado antes do registro)',
        montagem: resumoPedido,
      });
    }
    // ?testar=1: roda agora a IA de ilustração nas 12 primeiras cenas do vídeo mais novo (não muda nada no vídeo)
    let teste = null;
    if (req.query.testar && fila[0]) {
      const { planejarIlustracoes, diagIlustracao, COLECAO_POLITICA } = await import('../../../lib/politicaNoticias');
      Object.assign(diagIlustracao, { erros: [], sugeridas: 0, aceitas: 0, exemploRecusado: '' });
      const d = fila[0];
      let noticia = '';
      if (d.noticia) {
        const n = (await db.collection(COLECAO_POLITICA).doc(String(d.noticia)).get()).data() || {};
        noticia = [n.titulo, n.texto].filter(Boolean).join('\n');
      }
      const textos = [];
      for (const c of d.roteiro?.cenas || []) {
        const t = String(c.textoNarrado || c.texto || '').replace(/\s+/g, ' ').trim();
        if (t && textos[textos.length - 1] !== t) textos.push(t);
      }
      const t0 = Date.now();
      const r = await planejarIlustracoes(textos.slice(0, 12).map((texto) => ({ texto })), d.roteiro?.titulo || d.tema || '', noticia).catch((e) => String(e.message || e));
      teste = { segundos: (Date.now() - t0) / 1000, temTextoDaNoticia: !!noticia, cenasTestadas: Math.min(12, textos.length), resultado: Array.isArray(r) ? r.map((x) => (x ? `${x.tipo}: ${x.titulo}` : '-')) : r, ...diagIlustracao };
    }
    return res.status(200).json({ busca: req.query.q, videos, ...(teste ? { teste } : {}) });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
