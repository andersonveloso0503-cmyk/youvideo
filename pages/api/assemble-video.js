export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

// Sandbox e Produção da Shotstack usam CHAVES DE API DIFERENTES, não é só
// trocar o link. Resolve os dois a partir do "ambiente" escolhido na tela
// (ou da configuração antiga por variável de ambiente, se nada for enviado).
function resolverAmbiente(ambiente) {
  const modo = ambiente === 'sandbox' || ambiente === 'production' ? ambiente : (process.env.SHOTSTACK_ENV === 'production' ? 'production' : 'sandbox');
  const env = modo === 'production' ? 'v1' : 'stage';
  const apiKey = modo === 'production'
    ? process.env.SHOTSTACK_API_KEY
    : (process.env.SHOTSTACK_API_KEY_SANDBOX || process.env.SHOTSTACK_API_KEY);
  return { modo, env, apiKey, base: `https://api.shotstack.io/edit/${env}` };
}

export default async function handler(req, res) {
  if (req.method === 'GET') return checkStatus(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { audioUrl, audioSegments, cenas, formato, palavras, ambiente, marca } = req.body;

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

  const { modo, apiKey, base } = resolverAmbiente(ambiente);

  if (!apiKey) {
    return res.status(500).json({
      error: modo === 'sandbox'
        ? 'SHOTSTACK_API_KEY_SANDBOX não configurada ainda (pegue a chave de Sandbox no dashboard da Shotstack).'
        : 'SHOTSTACK_API_KEY não configurada ainda.',
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

  // O clipe animado da fal.ai (Wan Turbo) sempre sai com duração fixa e
  // curta (na prática uns 3-5s) — bem menor que a fatia de narração que a
  // cena precisa cobrir. Sem checar isso, a Shotstack toca o vídeo até
  // acabar e "congela" parado no último frame pelo resto do tempo. Sonda a
  // duração real de cada vídeo (mesma técnica do vídeo falado) pra saber
  // exatamente onde ele termina.
  const DURACAO_PADRAO_VIDEO_ANIMADO = 5; // usado só se a sonda falhar
  async function probarDuracaoVideo(url) {
    try {
      const probeRes = await fetch(`${base}/probe/${encodeURIComponent(url)}`, { headers: { 'x-api-key': apiKey } });
      const data = await probeRes.json();
      const duracao = parseFloat(data?.response?.metadata?.streams?.[0]?.duration);
      return duracao > 0 ? duracao : null;
    } catch {
      return null;
    }
  }
  const duracoesReais = await Promise.all(
    videosValidos.map((c) => (c.videoUrl ? probarDuracaoVideo(c.videoUrl) : Promise.resolve(null)))
  );

  let inicio = 0;
  let contadorCena = 0;
  const clipsVideo = videosValidos.flatMap((c, idx) => {
    contadorCena++;
    const start = usaTemposExplicitos ? c.start : inicio;
    const lengthFatia = usaTemposExplicitos ? c.length : duracaoPorCena;
    if (!usaTemposExplicitos) inicio += duracaoPorCena;

    if (!c.videoUrl) {
      // Cena 100% estática: zoom lento (Ken Burns), alternando pra
      // dentro/fora — dá sensação de movimento sem custo.
      return [{
        asset: { type: 'image', src: c.imageUrl },
        start,
        length: lengthFatia,
        fit: 'cover',
        effect: contadorCena % 2 === 0 ? 'zoomIn' : 'zoomOut',
      }];
    }

    // Cena animada: toca o vídeo até seu fim real e, se sobrar tempo da
    // fatia, completa com a mesma imagem de referência + zoom em vez de
    // deixar o vídeo congelado parado.
    const duracaoReal = Math.min(duracoesReais[idx] || DURACAO_PADRAO_VIDEO_ANIMADO, lengthFatia);
    const clipes = [{ asset: { type: 'video', src: c.videoUrl }, start, length: duracaoReal, fit: 'cover' }];
    const sobra = lengthFatia - duracaoReal;
    if (sobra > 0.2 && c.imageUrl) {
      clipes.push({
        asset: { type: 'image', src: c.imageUrl },
        start: start + duracaoReal,
        length: sobra,
        fit: 'cover',
        effect: contadorCena % 2 === 0 ? 'zoomOut' : 'zoomIn',
      });
    }
    return clipes;
  });

  // A Shotstack recusa (Payload Too Large) qualquer pedido de render acima
  // de ~390KB — antes disso, legenda palavra a palavra em textos longos
  // (orações de vários minutos, medleys grandes) estourava esse limite
  // fácil. O "ORCAMENTO_CLIPES" de antes não tinha efeito real (ficava
  // sempre preso em blocos de 3 palavras); agora o tamanho do bloco (quantas
  // palavras aparecem e são destacadas juntas) cresce de verdade conforme o
  // texto fica mais longo, mantendo o número de clipes de legenda sempre
  // dentro de um teto seguro.
  const ORCAMENTO_CLIPES = 220;
  const palavrasValidas = (palavras || []).filter((p) => p.start != null && p.end != null && p.end > p.start);
  const tamanhoBloco = Math.max(3, Math.ceil(palavrasValidas.length / ORCAMENTO_CLIPES));
  const blocos = [];
  for (let i = 0; i < palavrasValidas.length; i += tamanhoBloco) {
    blocos.push(palavrasValidas.slice(i, i + tamanhoBloco));
  }

  // CSS bem mais enxuto que antes (era repetido por inteiro em CADA clipe de
  // legenda — a maior fonte de peso do pedido de render).
  const cssLegenda = `p{font-family:Impact,'Arial Black',sans-serif;font-size:${
    isVertical ? 24 : 40
  }px;font-weight:900;text-transform:uppercase;text-align:center;margin:0;line-height:1.6;width:${
    isVertical ? 520 : 1160
  }px}.p,.a{color:#fff;text-shadow:2px 2px #000,-2px 2px #000,2px -2px #000,-2px -2px #000}.a{background:#8B2FC9;padding:4px 10px;border-radius:8px;box-decoration-break:clone;-webkit-box-decoration-break:clone}`;

  const legendaKaraoke = [];
  let ultimoFimLegenda = 0;
  for (const bloco of blocos) {
    // Cada bloco agora é 1 clipe só, com todas as palavras dele destacadas
    // juntas (deixou de ter sub-passos de destaque dentro do bloco — era
    // isso que gerava clipes demais sem necessidade).
    const html = bloco.map((p) => `<span class="a">${p.texto}</span>`).join(' ');

    // Trava de segurança: se o alinhamento saiu ruim (palavras com timestamp
    // apertado ou fora de ordem), isso evita que uma legenda comece antes da
    // anterior terminar (efeito de "atropelo") ou ultrapasse o fim do áudio.
    const inicioClipe = Math.max(bloco[0].start, ultimoFimLegenda);
    const fimClipeBruto = Math.max(bloco[bloco.length - 1].end, inicioClipe + 0.12);
    const fimClipe = Math.min(fimClipeBruto, duracaoTotalAudio);
    if (inicioClipe >= duracaoTotalAudio) continue; // nada a mostrar depois do fim do áudio
    ultimoFimLegenda = fimClipe;

    legendaKaraoke.push({
      asset: { type: 'html', html: `<p>${html}</p>`, css: cssLegenda, width: isVertical ? 580 : 1200, height: 160 },
      start: inicioClipe,
      length: Math.max(fimClipe - inicioClipe, 0.12),
      position: 'bottom',
      offset: { y: isVertical ? 0.24 : 0.1 },
    });
  }

  const marcaDagua = marca ? {
    asset: {
      type: 'html',
      html: `<p>${marca}</p>`,
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
  } : null;

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
      ...(marcaDagua ? [{ clips: [marcaDagua] }] : []),
      { clips: [equalizerVisual] },
      // Legenda embutida reativada por pedido do Anderson: fora do Kwai e
      // do TikTok (que geram legenda própria ao editar no app), as outras
      // plataformas (YouTube, Instagram, Facebook) não legendam sozinhas
      // quando o vídeo entra pela API — então continuamos precisando
      // queimar isso no vídeo.
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
        'x-api-key': apiKey,
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
  const { id, ambiente } = req.query;
  if (!id) return res.status(400).json({ error: 'Parâmetro id é obrigatório' });

  const { apiKey, base } = resolverAmbiente(ambiente);

  try {
    const statusRes = await fetch(`${base}/render/${id}`, {
      headers: { 'x-api-key': apiKey },
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
