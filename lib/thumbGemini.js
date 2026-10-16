// Thumbnail "chamativa" do canal bíblico feita pelo Gemini (Nano Banana), no mesmo estilo das capas
// de música que mais deram visualização: o próprio Gemini escreve o texto na imagem, com letras
// grossas em 3D, cores fortes, tamanhos diferentes e um selo — em vez do texto simples colado por cima.
import { put } from '@vercel/blob';

// imagens: [{ data (base64), mime }] — referências (ex.: a ficha do personagem, para ele sair igual)
export async function imagemGemini(prompt, proporcao, imagens = []) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não está configurada na Vercel.');
  const modelos = [...new Set([process.env.GEMINI_IMAGE_MODEL, 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'].filter(Boolean))];
  let ultimoErro = '';
  for (const modelo of modelos) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...imagens.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })), { text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: proporcao } },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || `Gemini ${r.status}`);
      const parte = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
      if (!parte) throw new Error(`o Gemini não devolveu imagem (${d.candidates?.[0]?.finishReason || 'sem motivo'})`);
      return { buffer: Buffer.from(parte.inlineData.data, 'base64'), mime: parte.inlineData.mimeType || 'image/png' };
    } catch (e) {
      ultimoErro = `${modelo}: ${e.message}`;
    }
  }
  throw new Error(`Thumbnail não gerada no Gemini — ${ultimoErro}`);
}

const limpar = (t, max) => String(t || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Thumbnail 16:9 do canal bíblico, estilo chamativo. Devolve a URL pública ou lança erro
 * (quem chama cai no modo antigo: Flux + texto por cima).
 */
export async function thumbBiblicaGemini({ tema, titulo, thumbnailTitulo, thumbnailSubtitulo, estilo }) {
  const principal = limpar(thumbnailTitulo, 40).toUpperCase() || limpar(titulo, 40).toUpperCase();
  if (!principal) throw new Error('Sem texto para a thumbnail.');
  const selo = limpar(thumbnailSubtitulo, 30).toUpperCase();
  const visual =
    estilo === 'desenho'
      ? 'vibrant high-end 3D animated movie style (like a big-studio animated film poster), expressive characters'
      : 'photorealistic cinematic movie-poster style, dramatic lighting, sharp detail';
  const prompt = `Create a VERY eye-catching YouTube thumbnail, 16:9 landscape, for a Brazilian Christian channel that tells Bible stories.
Video: "${limpar(titulo || tema, 140)}".
Image: ${visual}. One main Biblical character from this story (fictional depiction, full period clothing) with a strong emotional expression, close to the camera on one side of the frame, plus a dramatic scene from the story in the background. Rich saturated colors: deep purple and blue night sky or golden sunset, warm golden glow and light rays from heaven, high contrast. Must look great and readable as a tiny thumbnail on a phone.
Text on the image, in Brazilian Portuguese with the accents, spelled EXACTLY like this and nothing else:
- the headline "${principal}" HUGE, filling about half of the image, in thick heavy bold 3D letters with a shiny metallic GOLD finish (rich gold gradient, bright highlights, beveled edges), thick dark outline and a warm golden glow; the most important word even bigger${selo ? `
- a small ribbon/banner badge under the headline with "${selo}" in white on a red or purple banner` : ''}
Layout: headline on the side opposite to the character's face; nothing important in the bottom-right corner (YouTube shows the duration there).
Do NOT add any other words, logos, watermarks, channel names or brand names. No weapons, no blood, no wounds, no nudity.`;
  const img = await imagemGemini(prompt, '16:9');
  const ext = /jpe?g/.test(img.mime) ? 'jpg' : 'png';
  const b = await put(`thumbnails/biblia-${Date.now()}.${ext}`, img.buffer, {
    access: 'public',
    contentType: img.mime,
    token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  return b.url;
}
