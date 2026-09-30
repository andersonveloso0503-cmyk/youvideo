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
  return `${titulo}\n\n${hashtags.join(' ')}`.slice(0, 2200);
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
