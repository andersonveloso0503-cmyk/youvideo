export default async function handler(req, res) {
  if (req.method === 'GET') return checkStatus(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioUrl, cenas, formato } = req.body;

  if (!process.env.SHOTSTACK_API_KEY) {
    return res.status(500).json({
      error: 'SHOTSTACK_API_KEY não configurada ainda.',
    });
  }

  if (!audioUrl || audioUrl.startsWith('PENDENTE')) {
    return res.status(400).json({
      error: 'Ainda não existe um áudio de narração pronto (etapa 2 precisa terminar primeiro).',
    });
  }

  const videosValidos = (cenas || []).filter((c) => c.videoUrl || c.imageUrl);
  if (!videosValidos.length) {
    return res.status(400).json({
      error: 'Nenhuma cena com imagem/vídeo pronta ainda (etapa 3 precisa terminar primeiro).',
    });
  }

  const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
  const base = `https://api.shotstack.io/edit/${env}`;

  const isVertical = formato === 'short';
  const output = {
    format: 'mp4',
    resolution: isVertical ? 'mobile' : 'hd',
    aspectRatio: isVertical ? '9:16' : '16:9',
  };

  // Cada cena vira um clipe sequencial na trilha de vídeo; a narração inteira
  // toca por baixo numa trilha de áudio separada.
  const duracaoPorCena = 5; // segundos, ajustável depois
  let inicio = 0;
  const clipsVideo = videosValidos.map((c) => {
    const clip = {
      asset: c.videoUrl
        ? { type: 'video', src: c.videoUrl }
        : { type: 'image', src: c.imageUrl },
      start: inicio,
      length: duracaoPorCena,
      fit: 'cover',
    };
    inicio += duracaoPorCena;
    return clip;
  });

  const timeline = {
    tracks: [
      {
        clips: videosValidos
          .filter((c) => c.textoNarrado)
          .map((c, i) => ({
            asset: {
              type: 'title',
              text: c.textoNarrado,
              style: 'minimal',
              color: '#ffffff',
              size: 'medium',
              background: 'rgba(0,0,0,0.55)',
              position: 'bottom',
            },
            start: i * duracaoPorCena,
            length: duracaoPorCena,
          })),
      },
      { clips: clipsVideo },
      {
        clips: [
          {
            asset: { type: 'audio', src: audioUrl },
            start: 0,
            length: inicio,
          },
        ],
      },
    ],
  };

  try {
    const renderRes = await fetch(`${base}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.SHOTSTACK_API_KEY,
      },
      body: JSON.stringify({ timeline, output }),
    });

    const data = await renderRes.json();
    if (!renderRes.ok) throw new Error(data.message || 'Erro ao iniciar a montagem na Shotstack');

    return res.status(200).json({
      status: 'processing',
      renderId: data.response.id,
      aviso: 'Montagem enviada — pode levar de 1 a alguns minutos. Consulte o status com o ID do render.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function checkStatus(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Parâmetro id é obrigatório' });

  const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
  const base = `https://api.shotstack.io/edit/${env}`;

  try {
    const statusRes = await fetch(`${base}/render/${id}`, {
      headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
    });
    const data = await statusRes.json();
    if (!statusRes.ok) throw new Error(data.message || 'Erro ao consultar status');

    return res.status(200).json({
      status: data.response.status, // queued | fetching | rendering | saving | done | failed
      videoUrl: data.response.url || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
