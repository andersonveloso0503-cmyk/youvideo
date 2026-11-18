// 18/11 (dono: "veja para mim as melhores e suba, pode ser 5 — 5 de games e 5 de política"):
// Os Shorts que ficaram parados no ✅ Aprovar por falta de crédito nas IAs são conferidos UMA vez (sem correção
// automática, para não gastar), os de política sem nenhuma ilustração (feitos sem crédito) saem, e as MELHORES
// notas sobem — no máximo 5 por canal por dia, contando o que já foi aprovado hoje.
import { problemasGraves } from './travaQualidade';

export const MAX_SOBE_DIA = 5;
const diaBR = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const horaBR = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));

/** Quantos Shorts deste canal já foram aprovados (na mão ou sozinhos) ou subiram hoje. */
export function contarAprovadosHoje(xs) {
  const hoje = diaBR(Date.now());
  return xs.filter((x) => {
    const y = x.fabrica?.youtube || {};
    if (x.formato === 'longo' || !['pendente', 'enviando', 'ok'].includes(y.status)) return false;
    const t = Date.parse(y.aprovadoEm || '') || Number(y.em) || 0;
    return t && diaBR(t) === hoje;
  }).length;
}

export async function aprovadosHoje(db, campo) {
  const snap = await db.collection('youvideo_fila').where(campo, '==', true).get();
  return contarAprovadosHoje(snap.docs.map((d) => d.data()));
}

export async function melhoresDoDia(db) {
  const resumo = {};
  for (const campo of ['politica', 'games']) {
    const docs = (await db.collection('youvideo_fila').where(campo, '==', true).get()).docs.map((d) => ({ ref: d.ref, x: d.data() }));
    const cands = docs.filter(
      ({ x }) =>
        x.fabrica?.ativo !== false && x.formato === 'short' && x.status === 'concluido' && x.fabrica?.youtube?.status === 'revisar' && Date.now() - Date.parse(x.criadoEm || 0) < 48 * 3600e3
    );
    // 1) política sem NENHUMA ilustração (feita quando o Claude estava sem crédito): sai
    const ficam = [];
    for (const c of cands) {
      const semIlu = campo === 'politica' && !(c.x.arquivos || []).some((a) => a?.ilustracao);
      if (semIlu && (c.x.conferencia?.status === 'sem_credito' || c.x.reconferido)) {
        await c.ref.update({ 'fabrica.ativo': false, 'fabrica.descartadoPor': 'Saiu sozinho: feito sem crédito, sem ilustração (18/11).' }).catch(() => {});
        continue;
      }
      ficam.push(c);
    }
    // 2) os parados por falta de crédito: confere UMA vez, sem correção automática
    for (const c of ficam)
      if (c.x.conferencia?.status === 'sem_credito' && !c.x.reconferido)
        await c.ref.update({ 'conferencia.status': 'pendente', reconferido: true, semCorrecao: true }).catch(() => {});
    // 3) escolhe as melhores quando os reconferidos terminaram (ou a partir das 14h, com o que tiver)
    const esperando = ficam.filter(({ x }) => x.reconferido && ['pendente', 'conferindo', 'corrigindo', 'sem_credito'].includes(x.conferencia?.status));
    const vagas = Math.max(0, MAX_SOBE_DIA - contarAprovadosHoje(docs.map((d) => d.x)));
    resumo[campo] = { candidatos: ficam.length, esperandoConferencia: esperando.length, vagas };
    if (!vagas || (esperando.length && horaBR() < 14)) continue;
    const boas = ficam
      .filter(({ x }) => ['ok', 'atencao'].includes(x.conferencia?.status) && !problemasGraves(x.conferencia).length && Number(x.conferencia?.nota) >= 7)
      .sort((a, b) => Number(b.x.conferencia.nota) - Number(a.x.conferencia.nota) || String(b.x.criadoEm).localeCompare(String(a.x.criadoEm)));
    for (const { ref, x } of boas.slice(0, vagas)) {
      await ref.update({ 'fabrica.youtube': { status: 'pendente', aprovadoEm: new Date().toISOString(), aprovadoSozinho: `melhores do dia (nota ${x.conferencia.nota})` } }).catch(() => {});
      console.log(`[melhores-do-dia] ${campo}: sobe "${String(x.roteiro?.titulo || x.tema || '').slice(0, 60)}" (nota ${x.conferencia.nota})`);
    }
    resumo[campo].subiram = Math.min(vagas, boas.length);
  }
  return resumo;
}
