import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, titulo, estilo, thumbnailTitulo, thumbnailSubtitulo } = req.body;

  if (!process.env.FLUX_API_KEY) {
    return res.status(500).json({
      error: 'FLUX_API_KEY não configurada ainda.',
    });
  }

  try {
    const prompt = `Thumbnail profissional de YouTube estilo pôster de filme épico para vídeo bíblico sobre "${titulo || tema}". ${
      estilo === 'desenho'
        ? 'Estilo desenho animado vibrante, traço bem definido, cores saturadas.'
        : 'Fotografia hiper-realista, câmera DSLR, lente 85mm, textura de pele natural com poros visíveis, iluminação dramática (tipo "chiaroscuro"), grão de filme sutil, NÃO parece pintura nem arte digital.'
    } Retrato de meio-corpo ou close do personagem principal com expressão forte e emocional, olhar direto pra câmera, vestido com roupas completas da época. Fundo com paisagem bíblica dramática ao entardecer (deserto, montanhas, templo ou céu com nuvens douradas), luz de contraluz dourada (golden hour), criando atmosfera épica e cinematográfica. Composição de regra dos terços, alto contraste, cores saturadas e quentes (dourado, âmbar, laranja) que se destacam em miniatura pequena. Deixe a parte superior da imagem com menos detalhe e mais escura/uniforme, para permitir sobrepor texto grande depois. Sem texto sobreposto. Sem marca d'água. Qualidade de pôster de cinema 4K. Evite: armas, espadas, facas, sangue, ferimentos, nudez, torso nu, violência gráfica.`;

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

    if ((!thumbnailTitulo && !thumbnailSubtitulo) || !process.env.SHOTSTACK_API_KEY) {
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
                      html: `<div><p class="titulo">${thumbnailTitulo || ''}</p><p class="subtitulo">${thumbnailSubtitulo || ''}</p></div>`,
                      css: `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Open+Sans:wght@800&display=swap'); div { display: flex; flex-direction: column; align-items: center; } .titulo { font-family: 'Cinzel', serif; font-size: 150px; font-weight: 900; color: #F6D370; text-align: center; text-shadow: 5px 5px 0 #000, -5px -5px 0 #000, 5px -5px 0 #000, -5px 5px 0 #000, 0 0 20px rgba(0,0,0,0.9); margin: 0; text-transform: uppercase; letter-spacing: 4px; line-height: 1; } .subtitulo { font-family: 'Open Sans', sans-serif; font-size: 46px; font-weight: 800; color: #ffffff; text-align: center; text-shadow: 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000; margin: 12px 0 0 0; text-transform: uppercase; letter-spacing: 1px; }`,
                      width: 1150,
                      height: 320,
                    },
                    start: 0,
                    length: 1,
                    position: 'top',
                    offset: { y: -0.05 },
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
