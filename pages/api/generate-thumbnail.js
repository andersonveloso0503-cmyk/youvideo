import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, titulo, estilo, textoThumbnail } = req.body;

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
    } Close extremo no rosto do personagem principal com expressão forte e emocional (surpresa, determinação ou dor, conforme a cena), olhar direto pra câmera, vestido com roupas completas da época. Fundo desfocado com elemento simbólico da história ao fundo (ex: luz forte, estrada, templo, tempestade). Composição de regra dos terços, alto contraste entre luz e sombra, cores saturadas e quentes que se destacam em miniatura pequena. Sem texto sobreposto. Sem marca d'água. Qualidade de fotografia profissional 4K. Evite: armas, espadas, facas, sangue, ferimentos, nudez, torso nu, violência gráfica.`;

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
    const blobBase = await put(`thumbnail-base-${Date.now()}.jpg`, imgBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });

    if (!textoThumbnail || !process.env.SHOTSTACK_API_KEY) {
      return res.status(200).json({ imageUrl: blobBase.url });
    }

    // Sobrepõe o texto de forma nítida (a Flux não escreve texto de forma
    // confiável) usando um render de imagem única na Shotstack — mesmo
    // recurso de HTML que já usamos na legenda, evitando o canto inferior
    // direito onde o YouTube mostra a duração do vídeo.
    try {
      const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
      const renderRes = await fetch(`https://api.shotstack.io/edit/${env}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.SHOTSTACK_API_KEY },
        body: JSON.stringify({
          timeline: {
            tracks: [
              {
                clips: [
                  {
                    asset: {
                      type: 'html',
                      html: `<p>${textoThumbnail}</p>`,
                      css: `p { font-family: 'Open Sans', sans-serif; font-size: 64px; font-weight: 800; color: #ffffff; text-align: center; text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; margin: 0; text-transform: uppercase; }`,
                      width: 900,
                      height: 150,
                    },
                    start: 0,
                    length: 1,
                    position: 'top',
                    offset: { y: -0.08 },
                  },
                ],
              },
              { clips: [{ asset: { type: 'image', src: blobBase.url }, start: 0, length: 1, fit: 'cover' }] },
            ],
          },
          output: { format: 'jpg', size: { width: 1280, height: 720 } },
        }),
      });
      const renderData = await renderRes.json();
      if (!renderRes.ok) throw new Error(renderData.message || 'Erro ao compor texto na thumbnail');

      const renderId = renderData.response.id;
      let urlFinal = null;
      let tentativasRender = 0;
      while (tentativasRender < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        const statusRes = await fetch(`https://api.shotstack.io/edit/${env}/render/${renderId}`, {
          headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
        });
        const statusData = await statusRes.json();
        if (statusData.response.status === 'done') {
          urlFinal = statusData.response.url;
          break;
        }
        if (statusData.response.status === 'failed') throw new Error('Falha ao compor texto na thumbnail');
        tentativasRender++;
      }

      if (!urlFinal) return res.status(200).json({ imageUrl: blobBase.url });

      const finalRes = await fetch(urlFinal);
      const finalBuffer = Buffer.from(await finalRes.arrayBuffer());
      const blobFinal = await put(`thumbnail-${Date.now()}.jpg`, finalBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
        token: process.env.MEDIA_READ_WRITE_TOKEN,
      });
      return res.status(200).json({ imageUrl: blobFinal.url });
    } catch {
      // Se a composição do texto falhar por qualquer motivo, não trava o
      // fluxo — usa a imagem base sem texto.
      return res.status(200).json({ imageUrl: blobBase.url });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
