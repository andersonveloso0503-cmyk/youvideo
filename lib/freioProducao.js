// 18/11 (dono: "recém recarreguei a Anthropic e o Gemini e já foi tudo"): freios para não queimar crédito.
// 1) TETO DO DIA: no máximo 8 Shorts CRIADOS por canal em 24 h, contando os barrados. Antes, vídeo barrado
//    "não ocupava vaga" e outra notícia entrava no lugar: com a conferência barrando muito (e depois tudo, sem
//    crédito), o sistema fez ~80 vídeos em 36 h para subir 5 por dia — cada um gasta roteiro, capa, voz e conferência.
// 2) IA SEM CRÉDITO: quando Claude/Gemini respondem "sem crédito", nenhum vídeo novo é começado (sairia sem
//    ilustração e seria barrado) até uma chamada dar certo de novo ou passar 1 h.
import { getDb } from './firebase-admin';

export const TETO_CRIADOS_DIA = 8;
const DOC = () => getDb().collection('youvideo_config').doc('ia');

export const ehSemCredito = (msg) => /credit balance is too low|credits are depleted|prepayment credits|RESOURCE_EXHAUSTED|insufficient.?(funds|quota|credit)/i.test(String(msg || ''));

export async function marcarSemCredito(msg) {
  await DOC().set({ semCreditoEm: Date.now(), semCreditoMsg: String(msg || '').slice(0, 200) }, { merge: true }).catch(() => {});
}
export async function marcarComCredito() {
  await DOC().set({ semCreditoEm: 0 }, { merge: true }).catch(() => {});
}
export async function iaSemCredito() {
  const d = (await DOC().get().catch(() => null))?.data() || {};
  return !!d.semCreditoEm && Date.now() - d.semCreditoEm < 60 * 60e3;
}

/** Quantos Shorts ainda podem ser CRIADOS hoje neste canal ('politica' | 'games' | 'brasil'), contando os barrados. */
export async function restamHoje(db, campo) {
  const desde = new Date(Date.now() - 24 * 3600e3).toISOString();
  const snap = await db.collection('youvideo_fila').where(campo, '==', true).get();
  const criados = snap.docs.map((x) => x.data()).filter((x) => String(x.criadoEm || '') >= desde && x.formato !== 'longo').length;
  return Math.max(0, TETO_CRIADOS_DIA - criados);
}
