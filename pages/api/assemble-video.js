export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  if (req.method === 'GET') return checkStatus(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { audioUrl, audioSegments, cenas, formato, palavras } = req.body;

  // Quando os dados são grandes demais pra caber numa requisição (medleys
  // com várias músicas), quem chama sobe um JSON no Blob e manda só o link
  // aqui — a gente busca os dados de verdade a partir dele.
  if (req.body.dataUrl) {
    const dataRes = await fetch(req.body.dataUrl);
    if (!dataRes.ok) return res.status(400).json({ error: 'Não consegui buscar os dados do medley pelo link fornecido' });
    const extra = await dataRes.json();
    audioUrl = extra.audioUrl;
    audioSegments = extra.audioSegments;
    cenas = extra.cenas;
    palavras = extra.palavras;
  }

  if (!process.env.SHOTSTACK_API_KEY) {
    return res.status(500).json({
      error: 'SHOTSTACK_API_KEY não configurada ainda.',
    });
  }

  const temAudioSegments = audioSegments && audioSegments.length;

  if (!temAudioSegments && (!audioUrl || audioUrl.startsWith('PENDENTE'))) {
    return res.status(400).json({
      error: 'Ainda não existe um áudio pronto (etapa 2 precisa terminar primeiro).',
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

  // Usa o tempo real do áudio (baseado no timing das palavras, ou na soma
  // dos segmentos no caso de medley) como duração total do vídeo, pra ele
  // nunca terminar antes ou depois do áudio.
  const ultimaPalavra = (palavras || []).filter((p) => p.end != null).pop();
  const duracaoTotalAudio = temAudioSegments
    ? Math.max(...audioSegments.map((s) => s.start + s.length))
    : ultimaPalavra
      ? ultimaPalavra.end + 0.4
      : videosValidos.length * 5;

  // Se TODAS as cenas trouxerem tempo explícito (start/length) — caso do
  // fluxo de música, onde cada cena corresponde a um bloco real da letra —
  // usa esses tempos em vez de dividir igualmente entre as cenas.
  const usaTemposExplicitos = videosValidos.every((c) => c.start != null && c.length != null);
  const duracaoPorCena = duracaoTotalAudio / videosValidos.length;

  // Quando os tempos vêm de blocos de letra (fluxo de música), quase sempre
  // sobra um trecho instrumental antes da primeira palavra cantada e/ou
  // depois da última — sem isso, esses trechos ficam com tela preta porque
  // nenhuma cena cobre esse intervalo. Estica a primeira e a última cena
  // pra fechar essas pontas.
  if (usaTemposExplicitos && videosValidos.length) {
    const primeira = videosValidos[0];
    if (primeira.start > 0) {
      primeira.length = primeira.start + primeira.length;
      primeira.start = 0;
    }
    // Fecha qualquer buraco entre uma cena e a próxima (trechos
    // instrumentais entre um bloco de letra e outro) esticando a cena
    // atual até o início da seguinte.
    for (let i = 0; i < videosValidos.length - 1; i++) {
      const atual = videosValidos[i];
      const proxima = videosValidos[i + 1];
      const fimAtual = atual.start + atual.length;
      if (fimAtual < proxima.start) {
        atual.length = proxima.start - atual.start;
      }
    }
    const ultima = videosValidos[videosValidos.length - 1];
    const fimUltima = ultima.start + ultima.length;
    if (fimUltima < duracaoTotalAudio) {
      ultima.length = duracaoTotalAudio - ultima.start;
    }
  }

  let inicio = 0;
  let contadorCena = 0;
  const clipsVideo = videosValidos.map((c) => {
    contadorCena++;
    const start = usaTemposExplicitos ? c.start : inicio;
    const length = usaTemposExplicitos ? c.length : duracaoPorCena;
    const clip = {
      asset: c.videoUrl
        ? { type: 'video', src: c.videoUrl }
        : { type: 'image', src: c.imageUrl },
      start,
      length,
      fit: 'cover',
      // Cenas sem animação real ganham um zoom lento (efeito Ken Burns),
      // alternando pra dentro/fora — dá sensação de movimento sem custo.
      ...(!c.videoUrl ? { effect: contadorCena % 2 === 0 ? 'zoomIn' : 'zoomOut' } : {}),
    };
    if (!usaTemposExplicitos) inicio += duracaoPorCena;
    return clip;
  });

  // Cada palavra vira 1 clipe de legenda pro efeito karaokê. Isso funciona
  // bem pra 1 música, mas num medley de várias músicas o total de palavras
  // pode passar de mil — o que faz o pedido de montagem estourar o limite de
  // tamanho da Shotstack. Acima desse limite, agrupa em blocos (ainda
  // sincronizados com o tempo certo, só sem o destaque cor a cor).
  const LIMITE_PALAVRAS_KARAOKE = 500;
  const TAMANHO_BLOCO = 5;
  const palavrasValidas = (palavras || []).filter((p) => p.start != null && p.end != null && p.end > p.start);
  const usaKaraokePorPalavra = palavrasValidas.length <= LIMITE_PALAVRAS_KARAOKE;
  const blocos = [];
  for (let i = 0; i < palavrasValidas.length; i += TAMANHO_BLOCO) {
    blocos.push(palavrasValidas.slice(i, i + TAMANHO_BLOCO));
  }

  const cssLegenda = `p{font-family:'Open Sans',sans-serif;font-size:${
    isVertical ? 19 : 25
  }px;font-weight:700;text-align:center;background:#000;padding:8px 14px;border-radius:4px;margin:0;width:${
    isVertical ? 560 : 1160
  }px;max-width:${isVertical ? 560 : 1160}px;box-sizing:border-box;word-wrap:break-word;overflow-wrap:break-word}`;

  const legendaKaraoke = [];
  for (const bloco of blocos) {
    if (usaKaraokePorPalavra) {
      bloco.forEach((palavraAtual, idx) => {
        // Mostra só as palavras já cantadas até agora dentro do bloco (nunca
        // as que ainda vão vir), com a atual destacada em amarelo — efeito
        // karaokê sincronizado de verdade.
        const html = bloco
          .slice(0, idx + 1)
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
    } else {
      // Vídeo muito longo (medley): 1 clipe por bloco inteiro, texto branco
      // uniforme, ainda no tempo certo — sem gerar milhares de clipes.
      const html = bloco.map((p) => `<span style="color:#ffffff">${p.texto}</span>`).join(' ');
      const inicioBloco = bloco[0].start;
      const fimBloco = bloco[bloco.length - 1].end;
      legendaKaraoke.push({
        asset: { type: 'html', html: `<p>${html}</p>`, css: cssLegenda, width: isVertical ? 600 : 1200, height: 100 },
        start: inicioBloco,
        length: Math.max(fimBloco - inicioBloco, 0.5),
        position: 'bottom',
        offset: { y: 0.08 },
      });
    }
  }

  const marcaDagua = {
    asset: {
      type: 'html',
      html: `<p>Em Nome de Jesus</p>`,
      css: `p { font-family: 'Open Sans', sans-serif; font-size: ${
        isVertical ? 16 : 18
      }px; font-weight: 600; color: rgba(255,255,255,0.55); text-shadow: 0 1px 3px rgba(0,0,0,0.6); margin: 0; }`,
      width: 300,
      height: 40,
    },
    start: 0,
    length: duracaoTotalAudio,
    position: 'topRight',
    offset: { x: -0.03, y: 0.04 },
  };

  const equalizerVisual = {
    asset: {
      type: 'html5',
      html: '<div class="eq"><span></span><span></span><span></span><span></span><span></span></div>',
      css: `.eq { display: flex; align-items: flex-end; justify-content: center; gap: 5px; width: 100%; height: 100%; }
        .eq span { display: block; width: 7px; background: #ffd60a; border-radius: 3px; animation: barPulse 0.9s ease-in-out infinite; }
        .eq span:nth-child(1){ animation-delay: 0s; height: 14px; }
        .eq span:nth-child(2){ animation-delay: 0.15s; height: 26px; }
        .eq span:nth-child(3){ animation-delay: 0.3s; height: 38px; }
        .eq span:nth-child(4){ animation-delay: 0.15s; height: 26px; }
        .eq span:nth-child(5){ animation-delay: 0s; height: 14px; }
        @keyframes barPulse { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }`,
    },
    width: 120,
    height: 60,
    start: 0,
    length: duracaoTotalAudio,
    position: 'bottomLeft',
    offset: { x: 0.04, y: 0.06 },
  };

  const clipsAudio = temAudioSegments
    ? audioSegments.map((s) => ({ asset: { type: 'audio', src: s.url }, start: s.start, length: s.length }))
    : [{ asset: { type: 'audio', src: audioUrl }, start: 0, length: duracaoTotalAudio }];

  const timeline = {
    tracks: [
      { clips: [marcaDagua] },
      // TEMPORARIAMENTE DESATIVADO pra isolar um erro de montagem — o
      // asset "html5" do equalizador pode não estar sendo aceito.
      // { clips: [equalizerVisual] },
      ...(legendaKaraoke.length ? [{ clips: legendaKaraoke }] : []),
      { clips: clipsVideo },
      { clips: clipsAudio },
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
