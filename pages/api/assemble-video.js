export default async function handler(req, res) {
  if (req.method === 'GET') return checkStatus(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioUrl, cenas, formato, palavras } = req.body;

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

  // Usa o tempo real da narração (baseado no timing das palavras) pra dividir
  // as cenas de forma proporcional, em vez de um tempo fixo — evita o vídeo
  // terminar antes ou depois do áudio.
  const ultimaPalavra = (palavras || []).filter((p) => p.end != null).pop();
  const duracaoTotalAudio = ultimaPalavra ? ultimaPalavra.end + 0.4 : videosValidos.length * 5;
  const duracaoPorCena = duracaoTotalAudio / videosValidos.length;

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

  // Agrupa as palavras em blocos curtos (tipo linha de legenda). Em vídeos
  // curtos (Shorts), cada palavra do bloco vira um clipe próprio pra dar o
  // efeito karaokê (destaque muda em tempo real). Em vídeos longos isso geraria
  // centenas de clipes e estoura o limite de tamanho da Shotstack — então ali
  // cada bloco inteiro vira só UM clipe, sem o destaque palavra por palavra.
  const TAMANHO_BLOCO = 5;
  const palavrasValidas = (palavras || []).filter((p) => p.start != null && p.end != null && p.end > p.start);
  const blocos = [];
  for (let i = 0; i < palavrasValidas.length; i += TAMANHO_BLOCO) {
    blocos.push(palavrasValidas.slice(i, i + TAMANHO_BLOCO));
  }

  const cssLegenda = `p { font-family: 'Open Sans', sans-serif; font-size: ${
    isVertical ? 20 : 26
  }px; font-weight: 700; text-align: center; background: #000000; padding: 8px 14px; border-radius: 4px; margin: 0; width: ${
    isVertical ? 560 : 1160
  }px; max-width: ${isVertical ? 560 : 1160}px; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word; }`;

  const legendaKaraoke = [];
  if (isVertical) {
    // Short: efeito karaokê completo, palavra por palavra.
    for (const bloco of blocos) {
      bloco.forEach((palavraAtual, idx) => {
        const html = bloco
          .map((p, i) =>
            i === idx
              ? `<span style="color:#ffd60a">${p.texto}</span>`
              : `<span style="color:#ffffff">${p.texto}</span>`
          )
          .join(' ');

        legendaKaraoke.push({
          asset: { type: 'html', html: `<p>${html}</p>`, css: cssLegenda, width: isVertical ? 600 : 1200, height: 100 },
          start: palavraAtual.start,
          length: Math.max(palavraAtual.end - palavraAtual.start, 0.12),
          position: 'bottom',
          offset: { y: 0.08 },
        });
      });
    }
  } else {
    // Vídeo longo: um clipe só por bloco (sem destaque palavra por palavra),
    // pra não estourar o limite de tamanho do pedido.
    for (const bloco of blocos) {
      const html = bloco.map((p) => `<span style="color:#ffffff">${p.texto}</span>`).join(' ');
      const inicioBloco = bloco[0].start;
      const fimBloco = bloco[bloco.length - 1].end;
      legendaKaraoke.push({
        asset: { type: 'html', html: `<p>${html}</p>`, css: cssLegenda, width: 1200, height: 100 },
        start: inicioBloco,
        length: Math.max(fimBloco - inicioBloco, 0.5),
        position: 'bottom',
        offset: { y: 0.08 },
      });
    }
  }

  const timeline = {
    tracks: [
      ...(legendaKaraoke.length ? [{ clips: legendaKaraoke }] : []),
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
      erro: data.response.status === 'failed' ? data.response.error || data.response.data?.error || 'Motivo não informado pela Shotstack' : undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
