// Radar de Ofertas — busca a oferta para a página pública (só no servidor).
// Endereço normal: /oferta/<nome> (só ofertas publicadas). Prévia: /oferta/previa-<id> (qualquer situação).
import { getDb } from './firebase-admin';
import { COL_OFERTAS } from './ofertas';

export async function ofertaPublica(endereco) {
  const s = String(endereco || '');
  const db = getDb();
  let dados = null;
  let previa = false;
  if (s.startsWith('previa-')) {
    const snap = await db.collection(COL_OFERTAS).doc(s.slice(7)).get();
    if (snap.exists) { dados = snap.data(); previa = dados.status !== 'publicada'; }
  } else {
    const snap = await db.collection(COL_OFERTAS).where('slug', '==', s).limit(1).get();
    if (!snap.empty && snap.docs[0].data().status === 'publicada') dados = snap.docs[0].data();
  }
  if (!dados) return null;
  // só o que a página usa: nada de trava, alertas ou dados da análise
  const { produto, pagina, secoes, atualizadoEm } = dados;
  return { oferta: { produto, pagina, secoes: secoes || [], atualizadoEm: atualizadoEm || '' }, previa };
}
