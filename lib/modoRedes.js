// 23/11/2026: o YouTube encerrou os canais do dono (spam + "circumvention"). Pela regra, ele não pode usar,
// ter nem criar nenhum canal até poder pedir um canal novo (programa "segunda chance", a partir de 19/11/2027).
// Até lá: NADA sobe no YouTube, e os documentários de história vão para a Página do Facebook "Noites na História".
// Para religar o YouTube um dia, troque para false aqui E em desktop/src/engine/youtube.js.
export const YOUTUBE_DESLIGADO = true;

// Facebook "com segurança": no máximo 1 vídeo por dia em cada Página, às 19h de Brasília.
const HORA_UTC = 22; // 19h em Brasília (UTC-3)
const diaBR = (t) => new Date(t - 3 * 3600e3).toISOString().slice(0, 10);

export async function proximoHorarioFacebook(db, conta) {
  const agora = Date.now();
  const snap = await db.collection('youvideo_agenda').where('conta', '==', conta).get();
  const ocupados = new Set(
    snap.docs
      .map((d) => d.data())
      .filter((x) => x.redes?.facebook && !['erro', 'cancelado'].includes(x.redes.facebook.status))
      .map((x) => diaBR(new Date(x.quando).getTime())),
  );
  // Começa hoje (se ainda dá tempo para as 19h) ou amanhã
  let t = Date.UTC(new Date(agora).getUTCFullYear(), new Date(agora).getUTCMonth(), new Date(agora).getUTCDate(), HORA_UTC);
  if (t < agora + 30 * 60e3) t += 86400e3;
  for (let i = 0; i < 60 && ocupados.has(diaBR(t)); i++) t += 86400e3;
  return new Date(t).toISOString();
}
