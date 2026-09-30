// "Fábrica" de Shorts: lotes de histórias animadas e narrados criados pela fila do site
// (youvideo_fila com o campo `fabrica`), montados no PC e agendados nas redes.
import { getDb } from './firebase-admin';

export const FUSO = '-03:00'; // horário de Brasília (sem horário de verão)

/** Data (AAAA-MM-DD) + hora (HH:MM) no horário de Brasília -> ISO. */
export function horarioBrasilia(dia, hora) {
  return new Date(`${dia}T${hora}:00${FUSO}`).toISOString();
}

export function diaBrasilia(d = new Date()) {
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

export function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Legenda para as redes: título + hashtags das tags do roteiro. */
export function legendaDoItem(item) {
  const titulo = item.roteiro?.titulo || item.tema || '';
  const tags = (Array.isArray(item.roteiro?.tags) ? item.roteiro.tags : String(item.roteiro?.tags || '').split(','))
    .map((t) => String(t).trim().replace(/^#/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 6);
  const hashtags = ['fe', 'jesus', ...tags].filter((t, i, a) => a.indexOf(t) === i).map((t) => `#${t}`);
  const chamada = chamadaSerie(item);
  return `${titulo}${chamada ? `\n\n${chamada}` : ''}\n\n${hashtags.join(' ')}`.slice(0, 2200);
}

/** Série: "Siga para ver a Parte 2" (ou o aviso de final da série). Vazio se não for série. */
export function chamadaSerie(item) {
  const s = item?.serie;
  if (!s || !(s.total > 1)) return '';
  return s.parte < s.total
    ? `👉 Siga o perfil para não perder a PARTE ${s.parte + 1}! (Parte ${s.parte} de ${s.total})`
    : `✅ Final da série "${s.nome}"! Siga o perfil para a próxima história.`;
}

/**
 * Vídeo da fábrica ficou pronto: agenda Facebook/Instagram (automático) e TikTok/Kwai (celular)
 * no horário reservado. Se o horário já passou (ficou pronto atrasado), agenda para daqui a 15 min.
 * O YouTube fica para o Youvideo Compilador (sobe agendado com o canal escolhido).
 */
export async function agendarItemPronto(item, videoUrl, thumbnailUrl) {
  const f = item.fabrica || {};
  const redes = ['facebook', 'instagram', 'tiktok', 'kwai'].filter((r) => f.redes?.[r]);
  if (!redes.length) return null;
  let quando = f.quando ? new Date(f.quando) : new Date();
  if (quando.getTime() < Date.now() + 10 * 60e3) quando = new Date(Date.now() + 15 * 60e3);
  const manuais = ['kwai', 'tiktok'];
  const redesDoc = {};
  for (const r of redes) redesDoc[r] = { status: manuais.includes(r) ? 'manual' : 'pendente' };
  const ref = await getDb().collection('youvideo_agenda').add({
    titulo: String(item.roteiro?.titulo || item.tema || 'Vídeo').slice(0, 150),
    legenda: legendaDoItem(item),
    legendaCelular: legendaCelular(item.roteiro?.titulo || item.tema, legendaDoItem(item), chamadaSerie(item)),
    videoUrl,
    thumbnailUrl: thumbnailUrl || null,
    curto: item.formato === 'short',
    chaveBiblioteca: null,
    quando: quando.toISOString(),
    redes: redesDoc,
    pendente: redes.some((r) => !manuais.includes(r)),
    origem: 'fabrica',
    criadoEm: new Date().toISOString(),
  });
  return ref.id;
}

// Frases prontas para a legenda do TikTok e do Kwai (sorteia uma a cada post)
const FRASES_CELULAR = [
  '📖 Toda história da Bíblia tem uma lição para hoje. Qual foi a sua? 🙏',
  '✝️ Jesus continua transformando vidas. Siga para mais histórias da Bíblia!',
  '🙏 Se essa história tocou seu coração, compartilhe com alguém que precisa ouvir.',
  '📜 Histórias bíblicas contadas de um jeito que você nunca viu. Siga o perfil!',
  '💛 Deus não esqueceu de você. Comente "Amém" se você crê!',
  '🕊️ Um minuto de Palavra para renovar a sua fé hoje.',
  '📖 A Bíblia está cheia de milagres. Qual é a sua história favorita?',
  '✨ A fé que move montanhas começa com uma história como essa. Siga para a próxima!',
  '🙌 Escreva "Eu creio" nos comentários e marque quem precisa ver isso.',
  '📖 Histórias da Bíblia para toda a família. Salve para assistir de novo!',
  '✝️ O que Deus fez naquele tempo, Ele pode fazer na sua vida hoje. 🙏',
  '🕊️ Jesus te ama e tem um propósito para você. Siga e receba uma história por dia.',
];
const HASHTAGS_CELULAR = ['#fé', '#jesus', '#biblia', '#historiasbiblicas', '#deus', '#gospel'];

/** Legenda do TikTok/Kwai: frase pronta + título + hashtags (as do vídeo e as fixas do canal). */
export function legendaCelular(titulo, legendaBase = '', chamada = '') {
  // Série: a chamada "siga para ver a parte 2" vale mais que a frase pronta
  const frase = chamada || FRASES_CELULAR[Math.floor(Math.random() * FRASES_CELULAR.length)];
  const doVideo = (String(legendaBase).match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 5);
  const tags = [...doVideo, ...HASHTAGS_CELULAR].filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 8);
  return `${frase}\n\n${String(titulo || '').trim()}\n\n${tags.join(' ')}`.slice(0, 2200);
}
