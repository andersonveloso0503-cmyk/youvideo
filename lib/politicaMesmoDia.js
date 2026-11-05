// Política "no mesmo dia": o horário do YouTube é escolhido quando o vídeo fica pronto (e não dias antes, na aprovação).
// Notícia velha não vira vídeo: o que foi aprovado há mais de 2 dias e ainda não foi produzido sai da fila.
const INTERVALO = 2 * 3600e3; // 2 h entre vídeos do canal de política
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
export async function fixarHorariosPolitica(db, itens) {
  const agora = Date.now();
  const pol = itens.filter((i) => i.politica);
  const precisam = pol.filter((i) => i.mesmoDia && !i.horaFixada && i.status === 'concluido' && i.youtube?.status === 'pendente');
  if (!precisam.length) return {};
  const ocupados = pol
    .filter((i) => i.horaFixada || !i.mesmoDia || ['ok', 'enviando'].includes(i.youtube?.status))
    .map((i) => new Date(i.quandoYoutube || i.quando || 0).getTime())
    .filter((t) => t > agora - INTERVALO);
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

/**
 * Uma vez por hora: notícias de política aprovadas há mais de 2 dias que ainda não viraram vídeo saem da fila
 * (notícia velha não viraliza e gasta crédito); as que estavam presas numa data distante passam a "mesmo dia".
 */
export async function arrumarFilaPolitica(db) {
  const cfg = db.collection('youvideo_config').doc('politica_mesmo_dia');
  const c = (await cfg.get()).data() || {};
  if (c.em && Date.now() - c.em < 3600e3) return;
  await cfg.set({ em: Date.now() }, { merge: true });
  const snap = await db.collection('youvideo_fila').where('politica', '==', true).get();
  const agora = Date.now();
  for (const d of snap.docs) {
    const x = d.data();
    const f = x.fabrica || {};
    if (!f.ativo || f.horaFixada) continue;
    const ja = ['ok', 'enviando', 'revisar'].includes(f.youtube?.status);
    if (ja) continue;
    const idade = agora - new Date(x.criadoEm || 0).getTime();
    const produzindo = ['roteiro_ok', 'voz_ok', 'imagens_ok', 'animando', 'montando', 'concluido'].includes(x.status);
    if (!produzindo && x.status === 'pendente' && idade > VELHA) {
      await d.ref.update({ 'fabrica.ativo': false, status: 'erro', erro: 'Notícia velha: aprovada há mais de 2 dias e ainda não produzida — saiu da fila sem gastar crédito.' }).catch(() => {});
      continue;
    }
    if (!f.mesmoDia) await d.ref.update({ 'fabrica.mesmoDia': true, 'fabrica.quando': x.status === 'pendente' ? new Date().toISOString() : f.quando || new Date().toISOString() }).catch(() => {});
  }
}
