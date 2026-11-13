// Capa dos Shorts de games e de política no estilo das capas da IA do YouTube Studio (que o dono aprovou):
// arte em pé (9:16), cinematográfica, com 2 a 4 palavras GIGANTES em branco e amarelo no topo.
// Feita pelo Gemini (Nano Banana), que escreve o texto direito na imagem.
//  - Games: a arte oficial do jogo vai como referência, para o personagem/mundo sair fiel ao jogo.
//  - Política: NUNCA rosto de pessoa real (nem inventado): só símbolos do assunto (prédios, objetos, documentos, dinheiro...).
import { put } from '@vercel/blob';
import { imagemGemini } from './thumbGemini';

const limpar = (t, max) => String(t || '').replace(/["“”#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** 2 a 4 palavras de impacto para a capa (a "manchete" do roteiro, ou o começo do título). */
export function textoDaCapa(item) {
  const r = item.roteiro || {};
  let t = limpar(r.thumbnailTitulo, 40);
  if (!t) t = limpar(r.titulo, 80).split(/[:!?.—–-]/)[0];
  const palavras = t.split(' ').filter(Boolean);
  return palavras.slice(0, palavras.length > 5 ? 4 : 5).join(' ').toUpperCase();
}

async function referencia(url) {
  if (!url) return [];
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) return [];
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 7e6) return [];
    return [{ data: buf.toString('base64'), mime }];
  } catch {
    return [];
  }
}

/**
 * Gera a capa e devolve a URL pública (ou lança erro: quem chama cai na capa antiga).
 * tipo: 'games' | 'politica'
 */
// Modelos: 'pro' = Nano Banana Pro (texto mais caprichado, ~R$ 0,75) · 'economica' = Nano Banana (~R$ 0,25)
export const MODELOS_CAPA = { pro: ['gemini-3-pro-image-preview'], economica: ['gemini-2.5-flash-image'] };

export async function capaShortIa({ tipo, titulo, descricao, texto, refUrl, modelo = '', deitada = false }) {
  const manchete = limpar(texto, 40).toUpperCase();
  if (!manchete) throw new Error('Sem texto para a capa.');
  const assunto = `${limpar(titulo, 140)}${descricao ? ` — ${limpar(String(descricao).split('\n')[0], 220)}` : ''}`;
  const destaque = manchete.split(' ').slice(-Math.ceil(manchete.split(' ').length / 2)).join(' ');
  const textoCapa = `Text on the image, in Brazilian Portuguese with the accents, spelled EXACTLY like this and nothing else: "${manchete}".
Put it in the TOP THIRD, centered, HUGE (about 85% of the width), in a heavy condensed sans-serif (like Bebas Neue / Anton), ALL CAPS, on two lines; the words "${destaque}" in bright yellow (#FFD400) and the rest in pure white; thick black outline and a strong drop shadow so it reads instantly on a phone.
Do NOT add any other words, numbers, logos, watermarks, channel names, UI, borders or frames. Keep the bottom 15% calm (YouTube puts buttons there).`;
  const imagens = tipo === 'games' ? await referencia(refUrl) : [];
  const prompt =
    tipo === 'games'
      ? `Create a STUNNING vertical 9:16 cover image (YouTube Shorts thumbnail) for a Brazilian gaming news channel.
News: "${assunto}".
Image: ${imagens.length ? 'use the attached reference image (official art of the game) so the game, its characters and its world look EXACTLY like the real game — same character design, colors and style; ' : ''}a cinematic key-art scene that tells this news at a glance: the game's main character or iconic element big and close to the camera in the middle/lower part, dramatic rim lighting, rich saturated colors, depth, glow and particles, ultra sharp, high contrast, looks amazing even tiny on a phone. No real-world people.
${textoCapa}`
      : `Create a STUNNING vertical 9:16 cover image (YouTube Shorts thumbnail) for a Brazilian politics news channel.
News: "${assunto}".
Image: photorealistic, cinematic and dramatic, telling this news at a glance ONLY with symbolic objects and places related to it (for example: government buildings in Brasília like the Congress or the Supreme Court, a judge's gavel, official documents and stamps, money and coins, charts, ballot box, flags, phones, maps — whatever fits this news), one big hero object close to the camera, moody lighting, high contrast, deep shadows, warm highlights, sharp detail.
ABSOLUTELY NO PEOPLE: no faces, no human figures, no silhouettes of identifiable people, no portraits of politicians.
Be faithful to the news: no exaggeration, nothing that the news does not say.
${textoCapa}`;
  // Vídeo longo: a mesma capa, deitada (16:9), com o texto à esquerda
  const promptFinal = deitada
    ? prompt.replace(/vertical 9:16 cover image \(YouTube Shorts thumbnail\)/g, 'horizontal 16:9 YouTube video thumbnail').replace('Put it in the TOP THIRD, centered, HUGE (about 85% of the width)', 'Put it on the LEFT HALF, HUGE (about 50% of the width, 3 lines max)').replace('Keep the bottom 15% calm (YouTube puts buttons there).', 'Keep the bottom-right corner calm (YouTube puts the video length there).')
    : prompt;
  const img = await imagemGemini(promptFinal, deitada ? '16:9' : '9:16', imagens, MODELOS_CAPA[modelo] || (process.env.CAPA_SHORT_MODELO && MODELOS_CAPA[process.env.CAPA_SHORT_MODELO]) || null);
  const ext = /jpe?g/.test(img.mime) ? 'jpg' : 'png';
  const b = await put(`thumbnails/${deitada ? 'longo' : 'short'}-${tipo}-${modelo || 'auto'}-${Date.now()}.${ext}`, img.buffer, {
    access: 'public',
    contentType: img.mime,
    token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  return b.url;
}
