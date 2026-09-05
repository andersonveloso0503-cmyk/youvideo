// Funções compartilhadas entre o painel manual (chamado via fetch pelo navegador)
// e a fila automática (chamada pelo cron a partir do servidor). Cada função faz
// uma etapa do pipeline e devolve o resultado bruto, sem lidar com HTTP.

export async function gerarRoteiro({ tema, estilo, formato, duracaoDesejada }) {
  const duracaoSegundos = Number(duracaoDesejada) || (formato === 'short' ? 180 : 420);
  const palavrasAlvo = Math.round(duracaoSegundos * 2.3);
  const duracaoMin = Math.floor(duracaoSegundos / 60);
  const duracaoSeg = duracaoSegundos % 60;

  const formatoInstrucao =
    formato === 'short'
      ? `Formato Short: a narração precisa ter aproximadamente ${palavrasAlvo} palavras (pra durar bem perto de ${duracaoMin > 0 ? `${duracaoMin}min ` : ''}${duracaoSeg}s ao ser falada), gancho forte nos primeiros 3 segundos, ritmo direto.`
      : `Formato vídeo longo: a narração precisa ter aproximadamente ${palavrasAlvo} palavras (pra durar bem perto de ${duracaoMin}min ao ser falada), com introdução, desenvolvimento e conclusão bem desenvolvidos — não encurte o conteúdo, expanda com contexto histórico e detalhes da história pra atingir esse tamanho.`;

  const prompt = `Você é roteirista de um canal de histórias bíblicas no YouTube.
Tema: "${tema}"
Estilo visual: ${estilo}
${formatoInstrucao}

IMPORTANTE:
- Descreva cenas de forma visualmente segura para geração por IA: evite completamente palavras como "cruz", "crucificação", "sangue", "ferimentos", "soldados armados", "chicote", "coroa de espinhos" nas descrições visuais — mesmo cenas de sofrimento ou morte devem ser descritas de forma simbólica e indireta (ex: "silhueta ao entardecer, luz dourada, expressão serena", "figura solitária numa colina, céu dramático") em vez de literal. Transmita a emoção pela luz, composição e expressão do rosto, nunca por elementos de violência explícitos na descrição.
- Não copie trechos literais de nenhuma tradução da Bíblia; narre a história com suas próprias palavras, de forma envolvente e fiel ao relato.
- Divida a narração em cenas curtas, pensando em cada cena como um clipe de vídeo separado.
- GATILHOS DE RETENÇÃO (aplique de verdade, não apenas mencione):
  1. Nos primeiros 3-5 segundos da narração, comece com uma pergunta intrigante, uma afirmação surpreendente ou um "flash-forward" do momento mais tenso da história — nunca comece com "Olá" ou apresentação genérica.
  2. No meio da narração, insira pelo menos um "gancho de continuidade" (ex: "mas o que aconteceu a seguir mudaria tudo...") pra segurar quem está pensando em sair.
  3. Termine com uma pergunta reflexiva pro espectador ou um convite claro pra comentar/seguir a série.
  4. Use frases curtas e diretas na narração, evite parágrafos longos e formais — o tom deve soar como alguém contando uma história empolgante, não uma aula.
- Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "titulo": "título chamativo mas não enganoso, em português",
  "descricao": "descrição completa para o YouTube, em português: um parágrafo de abertura envolvente (2-3 frases resumindo o vídeo), seguido de mais contexto sobre a história e seu significado (pelo menos 150 palavras no total), terminando com 3-5 hashtags relevantes",
  "tags": ["12 a 15 tags relevantes em português, misturando termos amplos (ex: história bíblica) e específicos (ex: nome do personagem)"],
  "narracao": "texto completo da narração, em português",
  "cenas": [
    { "descricao": "descrição visual da cena para gerar imagem/vídeo", "textoNarrado": "trecho da narração correspondente" }
  ]
}`;

  const chamarGroq = async (tentativaExtra) => {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'user', content: prompt },
          ...(tentativaExtra
            ? [{ role: 'user', content: 'Sua última resposta não era um JSON válido. Responda APENAS com o objeto JSON, sem nenhum texto antes ou depois, sem comentários, com todas as aspas internas escapadas corretamente.' }]
            : []),
        ],
        temperature: tentativaExtra ? 0.4 : 0.8,
        max_completion_tokens: 8000,
        response_format: { type: 'json_object' },
      }),
    });
    return groqRes.json();
  };

  let data = await chamarGroq(false);
  let content = data.choices?.[0]?.message?.content?.trim() || '';
  content = content.replace(/^```json/, '').replace(/```$/, '').trim();

  try {
    return JSON.parse(content);
  } catch {
    data = await chamarGroq(true);
    content = data.choices?.[0]?.message?.content?.trim() || '';
    content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    return JSON.parse(content);
  }
}

export async function gerarNarracao({ texto }) {
  const { put } = await import('@vercel/blob');
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({ text: texto, model_id: 'eleven_multilingual_v2' }),
  });
  if (!ttsRes.ok) throw new Error(await ttsRes.text());

  const data = await ttsRes.json();
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  const blob = await put(`narracao-${Date.now()}.mp3`, audioBuffer, {
    access: 'public',
    contentType: 'audio/mpeg',
    token: process.env.MEDIA_READ_WRITE_TOKEN,
  });

  return { audioUrl: blob.url, palavras: agruparPalavras(data.alignment) };
}

function agruparPalavras(alignment) {
  if (!alignment?.characters) return [];
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const palavras = [];
  let atual = '';
  let inicio = null;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (c.trim() === '') {
      if (atual) {
        palavras.push({ texto: atual, start: inicio, end: character_end_times_seconds[i - 1] });
        atual = '';
        inicio = null;
      }
      continue;
    }
    if (inicio === null) inicio = character_start_times_seconds[i];
    atual += c;
  }
  if (atual) palavras.push({ texto: atual, start: inicio, end: character_end_times_seconds[characters.length - 1] });
  return palavras;
}

export async function gerarImagens({ cenas, estilo, formato }) {
  const estiloPrompt =
    estilo === 'desenho'
      ? 'estilo desenho animado, cores vibrantes, traço consistente, ilustração 2D'
      : 'fotografia hiper-realista, foto tirada com câmera DSLR, lente 85mm, profundidade de campo rasa, textura de pele natural com poros visíveis, iluminação cinematográfica dramática, grão de filme sutil, 8K, ultra detalhado, NÃO parece pintura nem ilustração digital';

  const arquivos = [];
  for (const cena of cenas) {
    const promptFinal = `${cena.descricao}, ${estiloPrompt}, personagens bíblicos, composição de cena de vídeo, alta qualidade`;
    const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptFinal,
        width: formato === 'short' ? 768 : 1344,
        height: formato === 'short' ? 1344 : 768,
      }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

    let imageUrl = null;
    let bloqueada = false;
    let tentativas = 0;
    while (tentativas < 45) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(submitData.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } });
      const pollData = await pollRes.json();
      if (pollData.status === 'Ready') {
        imageUrl = pollData.result?.sample;
        break;
      }
      if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) {
        bloqueada = true;
        break;
      }
      tentativas++;
    }

    if (bloqueada) {
      arquivos.push({ cena: cena.descricao, erro: 'Cena barrada pelo filtro de conteúdo.' });
      continue;
    }
    if (!imageUrl) throw new Error(`Tempo esgotado na cena "${cena.descricao}"`);

    arquivos.push({ cena: cena.descricao, textoNarrado: cena.textoNarrado || '', imageUrl });
  }
  return arquivos;
}

export async function enviarAnimacao(imageUrl, descricaoCena, formato, duracaoAlvo) {
  const duracaoVideo = duracaoAlvo && duracaoAlvo > 5 ? 10 : 5;
  const submitRes = await fetch('https://fal.run/minimax/h3-max/image-to-video', {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `${descricaoCena}, movimento de câmera sutil, cena viva mas estável`,
      image_url: imageUrl,
      duration: duracaoVideo,
      resolution: '768p',
    }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.detail || submitData.message || 'Erro ao enviar pedido à fal.ai');
  return {
    requestId: submitData.request_id,
    statusUrl: submitData.status_url || `https://queue.fal.run/minimax/h3-max/requests/${submitData.request_id}/status`,
    responseUrl: submitData.response_url || `https://queue.fal.run/minimax/h3-max/requests/${submitData.request_id}`,
  };
}

export async function checarAnimacao(statusUrl, responseUrl) {
  const statusRes = await fetch(statusUrl, { headers: { Authorization: `Key ${process.env.FAL_KEY}` } });
  const statusData = await statusRes.json();
  if (!statusRes.ok) throw new Error(statusData.detail || 'Erro ao consultar status da fal.ai');

  if (statusData.status === 'COMPLETED') {
    const resultRes = await fetch(responseUrl, { headers: { Authorization: `Key ${process.env.FAL_KEY}` } });
    const resultData = await resultRes.json();
    if (!resultRes.ok) throw new Error(resultData.detail || 'Erro ao buscar o vídeo pronto');
    const videoUrl = resultData.video?.url || resultData.data?.video?.url || null;
    return { status: 'done', videoUrl };
  }
  if (statusData.status === 'ERROR' || statusData.status === 'FAILED') {
    return { status: 'failed', error: statusData.error || 'Falha na geração' };
  }
  return { status: 'processing' };
}

export async function iniciarMontagem({ audioUrl, cenas, formato, palavras }) {
  const videosValidos = (cenas || []).filter((c) => c.videoUrl || c.imageUrl);
  const isVertical = formato === 'short';
  const output = { format: 'mp4', resolution: isVertical ? 'mobile' : 'hd', aspectRatio: isVertical ? '9:16' : '16:9' };

  const ultimaPalavra = (palavras || []).filter((p) => p.end != null).pop();
  const duracaoTotalAudio = ultimaPalavra ? ultimaPalavra.end + 0.4 : videosValidos.length * 5;
  const duracaoPorCena = duracaoTotalAudio / videosValidos.length;

  let inicio = 0;
  const clipsVideo = videosValidos.map((c) => {
    const clip = {
      asset: c.videoUrl ? { type: 'video', src: c.videoUrl } : { type: 'image', src: c.imageUrl },
      start: inicio,
      length: duracaoPorCena,
      fit: 'cover',
    };
    inicio += duracaoPorCena;
    return clip;
  });

  const TAMANHO_BLOCO = 5;
  const palavrasValidas = (palavras || []).filter((p) => p.start != null && p.end != null && p.end > p.start);
  const blocos = [];
  for (let i = 0; i < palavrasValidas.length; i += TAMANHO_BLOCO) blocos.push(palavrasValidas.slice(i, i + TAMANHO_BLOCO));

  const cssLegenda = `p { font-family: 'Open Sans', sans-serif; font-size: ${isVertical ? 20 : 26}px; font-weight: 700; text-align: center; background: #000000; padding: 8px 14px; border-radius: 4px; margin: 0; width: ${isVertical ? 560 : 1160}px; max-width: ${isVertical ? 560 : 1160}px; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word; }`;

  const legendaKaraoke = [];
  if (isVertical) {
    for (const bloco of blocos) {
      bloco.forEach((palavraAtual, idx) => {
        const html = bloco
          .map((p, i) => (i === idx ? `<span style="color:#ffd60a">${p.texto}</span>` : `<span style="color:#ffffff">${p.texto}</span>`))
          .join(' ');
        legendaKaraoke.push({
          asset: { type: 'html', html: `<p>${html}</p>`, css: cssLegenda, width: 600, height: 100 },
          start: palavraAtual.start,
          length: Math.max(palavraAtual.end - palavraAtual.start, 0.12),
          position: 'bottom',
          offset: { y: 0.08 },
        });
      });
    }
  } else {
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
      { clips: [{ asset: { type: 'audio', src: audioUrl }, start: 0, length: inicio }] },
    ],
  };

  const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
  const renderRes = await fetch(`https://api.shotstack.io/edit/${env}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.SHOTSTACK_API_KEY },
    body: JSON.stringify({ timeline, output }),
  });
  const data = await renderRes.json();
  if (!renderRes.ok) throw new Error(data.message || 'Erro ao iniciar a montagem na Shotstack');
  return data.response.id;
}

export async function checarMontagem(renderId) {
  const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
  const statusRes = await fetch(`https://api.shotstack.io/edit/${env}/render/${renderId}`, {
    headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
  });
  const data = await statusRes.json();
  if (!statusRes.ok) throw new Error(data.message || 'Erro ao consultar status');
  return {
    status: data.response.status,
    videoUrl: data.response.url || null,
    erro: data.response.status === 'failed' ? data.response.error || data.response.data?.error || 'Motivo não informado' : undefined,
  };
}

export async function gerarThumbnail({ tema, titulo, estilo }) {
  const prompt = `Thumbnail profissional de YouTube estilo viral para vídeo sobre "${titulo || tema}". ${
    estilo === 'desenho'
      ? 'Estilo desenho animado vibrante, traço bem definido, cores saturadas.'
      : 'Fotografia hiper-realista, câmera DSLR, lente 85mm, textura de pele natural com poros visíveis, iluminação dramática (tipo "chiaroscuro"), grão de filme sutil, NÃO parece pintura nem arte digital.'
  } Close extremo no rosto do personagem principal com expressão forte e emocional, olhar direto pra câmera. Fundo desfocado com elemento simbólico da história. Composição de regra dos terços, alto contraste, cores saturadas e quentes. Sem texto sobreposto. Sem marca d'água. Qualidade 4K.`;

  const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
    method: 'POST',
    headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width: 1280, height: 720 }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

  let imageUrl = null;
  let tentativas = 0;
  while (tentativas < 45) {
    await new Promise((r) => setTimeout(r, 1000));
    const pollRes = await fetch(submitData.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } });
    const pollData = await pollRes.json();
    if (pollData.status === 'Ready') {
      imageUrl = pollData.result?.sample;
      break;
    }
    if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) break;
    tentativas++;
  }
  return imageUrl;
}
