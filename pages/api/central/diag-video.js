// Diagnóstico de um vídeo da Fábrica: GET ?q=<parte do título>&token=SENHA
// Mostra, para os vídeos com esse título: se a IA escolheu ilustrações, quantas cenas, se a receita levou as ilustrações
// e qual PC (e versão do Compilador) montou.
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { COLECAO } from '../../../lib/montarPc';

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
        montagem: resumoPedido,
      });
    }
    return res.status(200).json({ busca: req.query.q, videos });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
