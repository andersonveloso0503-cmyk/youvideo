// Política e games "no mesmo dia": o horário do YouTube é escolhido quando o vídeo fica pronto (e não dias antes, na aprovação).
// Notícia velha não vira vídeo: o que foi aprovado há mais de 2 dias e ainda não foi produzido sai da fila.
const INTERVALO = 3 * 3600e3; // 3 h entre vídeos do canal (5 por dia, das 7h às 23h)
const VELHA = 48 * 3600e3;

const horaBrasilia = (t) => new Date(t - 3 * 3600e3).getUTCHours();
function paraHorarioBom(t) {
  const h = horaBrasilia(t);
  if (h >= 7 && h < 23) return t;
  const d = new Date(t - 3 * 3600e3);
  if (h >= 23) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(7, 0, 0, 0);
  return d.getTime() + 3 * 3600e3;
}

/** Próximo horário livre do canal de política a partir de agora (+20 min), 2 h longe dos outros. */
export function proximoHorarioLivre(ocupados, agora = Date.now()) {
  const marcados = ocupados.filter((t) => t > agora - INTERVALO).sort((a, b) => a - b);
  let t = paraHorarioBom(agora + 20 * 60e3);
  for (let volta = 0; volta < 80; volta++) {
    const perto = marcados.find((m) => Math.abs(m - t) < INTERVALO);
    if (!perto) break;
    t = paraHorarioBom(perto + INTERVALO);
  }
  return t;
}

/**
 * Antes de entregar os vídeos ao PC para subir: cada vídeo de política "mesmo dia" pronto ganha agora
 * o próximo horário livre. Devolve os horários novos por id (para a lista já sair certa).
 */
export async function fixarHorariosPolitica(db, itens, campo = 'politica') {
  const agora = Date.now();
  const pol = itens.filter((i) => i[campo]);
  const precisam = pol.filter((i) => i.mesmoDia && !i.horaFixada && i.status === 'concluido' && i.youtube?.status === 'pendente');
  if (!precisam.length) return {};
  // Horários já ocupados: inclusive os vídeos que JÁ subiram/agendados no YouTube (a lista do PC não traz esses —
  // por isso dois vídeos caíam a 2 min um do outro). Só lê o banco quando há vídeo para marcar.
  const doBanco = (await db.collection('youvideo_fila').where(campo, '==', true).get()).docs
    .map((d) => d.data())
    .filter((x) => x.fabrica?.ativo !== false && (x.fabrica?.horaFixada || ['ok', 'enviando'].includes(x.fabrica?.youtube?.status)))
    .map((x) => new Date(x.fabrica?.quandoYoutube || x.fabrica?.quando || 0).getTime());
  const ocupados = [
    ...doBanco,
    ...pol.filter((i) => i.horaFixada || !i.mesmoDia || ['ok', 'enviando'].includes(i.youtube?.status)).map((i) => new Date(i.quandoYoutube || i.quando || 0).getTime()),
  ].filter((t) => t > agora - INTERVALO);
  const novos = {};
  // o que ficou pronto antes sai antes
  for (const i of precisam.sort((a, b) => String(a.concluidoEm || '').localeCompare(String(b.concluidoEm || '')))) {
    const t = proximoHorarioLivre(ocupados, agora);
    ocupados.push(t);
    const iso = new Date(t).toISOString();
    novos[i.id] = iso;
    await db.collection('youvideo_fila').doc(i.id).update({ 'fabrica.quandoYoutube': iso, 'fabrica.quando': iso, 'fabrica.horaFixada': true }).catch(() => {});
  }
  return novos;
}

const VAZIAS = new Set('para pra por com sem que sobre apos mais seu sua dos das nos nas uma uns umas'.split(' '));
const chave = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VAZIAS.has(w)).map((w) => w.slice(0, 5)); // raiz: israel/israelense
/** Mesma notícia com título diferente ("Flávio Bolsonaro foge para os EUA" x "... foge para os EUA após derrota") */
export function mesmaNoticia(a, b) {
  const A = new Set(chave(a)), B = new Set(chave(b));
  if (A.size < 2 || B.size < 2) return false;
  const comum = [...A].filter((w) => B.has(w)).length;
  return comum >= 3 && (comum / Math.min(A.size, B.size) >= 0.8 || comum / new Set([...A, ...B]).size >= 0.65);
}

const MAX_NA_FILA = { politica: 5, games: 5 }; // 5 por dia em cada canal: mais alcance por vídeo

/**
 * A cada hora: arruma a fila "mesmo dia" do canal.
 * - notícia aprovada há mais de 2 dias e ainda não produzida sai (notícia velha não viraliza e gasta crédito);
 * - notícias repetidas (título parecido com outra da fila ou já produzida) saem, fica a mais nova;
 * - das que ainda não começaram, ficam só as 8 mais novas (o resto sai sem gastar crédito);
 * - as que estavam presas numa data distante passam a "mesmo dia".
 */
export async function arrumarFilaPolitica(db, campo = 'politica') {
  const cfg = db.collection('youvideo_config').doc(`${campo}_mesmo_dia_v3`);
  const c = (await cfg.get()).data() || {};
  if (c.em && Date.now() - c.em < 3600e3) return;
  await cfg.set({ em: Date.now() }, { merge: true });
  const snap = await db.collection('youvideo_fila').where(campo, '==', true).get();
  const agora = Date.now();
  const titulo = (x) => x.roteiro?.titulo || x.tema || '';
  const docs = snap.docs.map((d) => ({ ref: d.ref, x: d.data() }));
  // Já produzidos/no YouTube: servem de referência para achar repetido
  const produzidos = docs.filter(({ x }) => x.fabrica?.ativo !== false && (x.status === 'concluido' || ['ok', 'enviando', 'revisar'].includes(x.fabrica?.youtube?.status)) && agora - new Date(x.criadoEm || 0).getTime() < 7 * 86400e3);
  // Ainda não começaram (só roteiro na fila): candidatos a sair
  const esperando = docs
    .filter(({ x }) => x.fabrica?.ativo && !x.fabrica?.horaFixada && x.status === 'pendente' && !['ok', 'enviando', 'revisar'].includes(x.fabrica?.youtube?.status))
    .sort((a, b) => String(b.x.criadoEm || '').localeCompare(String(a.x.criadoEm || ''))); // mais novas primeiro
  const tirar = async (ref, motivo) => ref.update({ 'fabrica.ativo': false, status: 'erro', erro: motivo }).catch(() => {});
  const ficam = [];
  for (const d of esperando) {
    const t = titulo(d.x);
    if (agora - new Date(d.x.criadoEm || 0).getTime() > VELHA) {
      await tirar(d.ref, 'Notícia velha: aprovada há mais de 2 dias e ainda não produzida — saiu da fila sem gastar crédito.');
      continue;
    }
    const igual = [...produzidos.map((p) => titulo(p.x)), ...ficam.map((f) => titulo(f.x))].find((o) => mesmaNoticia(o, t));
    if (igual) {
      await tirar(d.ref, `Repetida: mesma notícia de "${String(igual).slice(0, 70)}" — saiu da fila sem gastar crédito.`);
      continue;
    }
    if (ficam.length >= MAX_NA_FILA[campo]) {
      await tirar(d.ref, 'Fila cheia: ficaram só as notícias mais novas — saiu da fila sem gastar crédito. Aprove de novo se ainda quiser.');
      continue;
    }
    ficam.push(d);
    if (!d.x.fabrica?.mesmoDia) await d.ref.update({ 'fabrica.mesmoDia': true, 'fabrica.quando': new Date().toISOString() }).catch(() => {});
  }
  // Em produção (já passou do roteiro) presas numa data distante: passam a mesmo dia
  for (const { ref, x } of docs) {
    const f = x.fabrica || {};
    if (!f.ativo || f.mesmoDia || f.horaFixada || x.status === 'pendente' || x.status === 'concluido' || x.status === 'erro') continue;
    if (['ok', 'enviando', 'revisar'].includes(f.youtube?.status)) continue;
    await ref.update({ 'fabrica.mesmoDia': true }).catch(() => {});
  }
}

/** Canal do YouTube dos games (guardado na aprovação das notícias de games). */
export async function canalDosGamesId(db) {
  return (await db.collection('youvideo_config').doc('games_noticias').get().catch(() => null))?.data()?.canalYoutube?.id || '';
}

/**
 * Canal do YouTube da política: o guardado na última aprovação certa, ou o mais usado pelos vídeos de política
 * (sem contar o canal dos games). Serve para corrigir vídeo de política que foi marcado no canal dos games.
 */
export async function canalDaPolitica(db, canalGames) {
  const salvo = (await db.collection('youvideo_config').doc('politica_canal').get().catch(() => null))?.data()?.canalYoutube;
  if (salvo?.id && salvo.id !== canalGames) return salvo;
  const snap = await db.collection('youvideo_fila').where('politica', '==', true).limit(400).get().catch(() => null);
  const conta = new Map();
  for (const d of snap?.docs || []) {
    const c = d.data().fabrica?.canalYoutube;
    if (!c?.id || c.id === canalGames) continue;
    const x = conta.get(c.id) || { c, n: 0 };
    x.n++;
    conta.set(c.id, x);
  }
  return [...conta.values()].sort((a, b) => b.n - a.n)[0]?.c || null;
}
