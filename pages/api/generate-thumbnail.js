import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, titulo, estilo } = req.body;

  if (!process.env.FLUX_API_KEY) {
    return res.status(500).json({
      error: 'FLUX_API_KEY não configurada ainda.',
    });
  }

  try {
    const prompt = `Thumbnail profissional de YouTube estilo viral para vídeo sobre "${titulo || tema}". ${
      estilo === 'desenho'
        ? 'Estilo desenho animado vibrante, traço bem definido, cores saturadas.'
        : 'Fotografia hiper-realista, câmera DSLR, lente 85mm, textura de pele natural com poros visíveis, iluminação dramática (tipo "chiaroscuro"), grão de filme sutil, NÃO parece pintura nem arte digital.'
    } Close extremo no rosto do personagem principal com expressão forte e emocional (surpresa, determinação ou dor, conforme a cena), olhar direto pra câmera. Fundo desfocado com elemento simbólico da história ao fundo (ex: luz forte, estrada, templo, tempestade). Composição de regra dos terços, alto contraste entre luz e sombra, cores saturadas e quentes que se destacam em miniatura pequena. Sem texto sobreposto. Sem marca d'água. Qualidade de fotografia profissional 4K.`;

    const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-key': process.env.FLUX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, width: 1280, height: 720 }),
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

    const pollingUrl = submitData.polling_url;
    let imageUrlTemporaria = null;
    let tentativas = 0;

    while (tentativas < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(pollingUrl, { headers: { 'x-key': process.env.FLUX_API_KEY } });
      const pollData = await pollRes.json();

      if (pollData.status === 'Ready') {
        imageUrlTemporaria = pollData.result?.sample;
        break;
      }
      if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) {
        throw new Error(`Geração falhou: ${pollData.status}`);
      }
      tentativas++;
    }

    if (!imageUrlTemporaria) throw new Error('Tempo esgotado esperando a thumbnail');

    const imgRes = await fetch(imageUrlTemporaria);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`thumbnail-${Date.now()}.jpg`, imgBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });

    return res.status(200).json({ imageUrl: blob.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
