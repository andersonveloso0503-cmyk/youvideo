// 19/11: PAUSA POR CANAL DO YOUTUBE (dono: "coloca um botão de pausa nas contas para não continuar fazendo").
// Canal pausado: a nuvem não cria nem produz vídeo novo para ele e nenhum PC sobe nada nele.
// Fica num documento só, para valer em todos os PCs e em todos os caminhos (Fábrica, games, política,
// Brasil Inacreditável, documentários, Biblioteca, Subir vídeos).
import { getDb } from './firebase-admin';

const DOC = () => getDb().collection('youvideo_config').doc('canais_pausados');

let cache = null;
let cacheEm = 0;

/** { [canalId]: { titulo, em } } — só os canais pausados. */
export async function lerPausas({ fresco = false } = {}) {
  if (!fresco && cache && Date.now() - cacheEm < 60e3) return cache;
  const d = await DOC().get().catch(() => null);
  cache = (d && d.exists && d.data().canais) || {};
  cacheEm = Date.now();
  return cache;
}

export async function canalPausado(canalId) {
  if (!canalId) return false;
  return !!(await lerPausas())[String(canalId)];
}

export async function pausarCanal(canalId, titulo, pausado) {
  const id = String(canalId);
  const atual = { ...(await lerPausas({ fresco: true })) };
  if (pausado) atual[id] = { titulo: String(titulo || ''), em: new Date().toISOString() };
  else delete atual[id];
  await DOC().set({ canais: atual, atualizadoEm: new Date().toISOString() });
  cache = atual;
  cacheEm = Date.now();
  return atual;
}
