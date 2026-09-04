// Funções compartilhadas entre o painel manual (chamado via fetch pelo navegador)
// e a fila automática (chamada pelo cron a partir do servidor). Cada função faz
// uma etapa do pipeline e devolve o resultado bruto, sem lidar com HTTP.

export async function gerarRoteiro({ tema, estilo, formato }) {
  const formatoInstrucao =
    formato === 'short'
      ? 'Formato Short: narração de 30 a 50 segundos, direto ao ponto, gancho forte nos primeiros 3 segundos.'
      : 'Formato vídeo longo: narração de 4 a 7 minutos, com introdução, desenvolvimento e conclusão.';

  const prompt = `Você é roteirista de um canal de histórias bíblicas no YouTube.
Tema: "${tema}"
Estilo visual: ${estilo}
${formatoInstrucao}

IMPORTANTE:
- Descreva cenas de forma visualmente segura para geração por IA: evite ferimentos, sangue, violência gráfica ou sofrimento físico explícito nas descrições visuais das cenas — prefira transmitir emoção e tensão pela expressão dos personagens, luz e composição, não por detalhes gráficos.
- Não copie trechos literais de nenhuma tradução da Bíblia; narre a história com suas próprias palavras, de forma envolvente e fiel ao relato.
- Divida a narração em cenas curtas, pensando em cada cena como um clipe de vídeo separado.
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
        max_completion_tokens: 6000,
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
  const duracaoKling = duracaoAlvo && duracaoAlvo > 5 ? 10 : 5;
  const submitRes = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: { 'X-API-Key': process.env.KLING_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kling',
      task_type: 'video_generation',
      input: {
        version: '2.6',
        mode: 'pro',
        duration: duracaoKling,
        aspect_ratio: formato === 'short' ? '9:16' : '16:9',
        image_url: imageUrl,
        prompt: `${descricaoCena}, movimento de câmera sutil, cena viva mas estável`,
      },
    }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.message || 'Erro ao enviar pedido à Kling');
  const taskId = submitData.data?.task_id || submitData.task_id;
  if (!taskId) throw new Error('Kling não retornou um task_id');
  return taskId;
}

export async function checarAnimacao(taskId) {
  const statusRes = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
    headers: { 'X-API-Key': process.env.KLING_API_KEY },
  });
  const statusData = await statusRes.json();
  if (!statusRes.ok) throw new Error(statusData.message || 'Erro ao consultar status da Kling');
  const info = statusData.data || statusData;
  if (info.status === 'completed' || info.status === 'success') {
    const videoUrl =
      info.output?.video_url ||
      info.output?.works?.[0]?.video?.resource_without_watermark ||
      info.output?.works?.[0]?.video?.resource;
    return { status: 'done', videoUrl: videoUrl || null };
  }
  if (info.status === 'failed') return { status: 'failed', error: info.error?.message };
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

  const legendaKaraoke = [];
  for (const bloco of blocos) {
    bloco.forEach((palavraAtual, idx) => {
      const html = bloco
        .map((p, i) => (i === idx ? `<span style="color:#ffd60a">${p.texto}</span>` : `<span style="color:#ffffff">${p.texto}</span>`))
        .join(' ');
      legendaKaraoke.push({
        asset: {
          type: 'html',
          html: `<p>${html}</p>`,
          css: `p { font-family: 'Open Sans', sans-serif; font-size: ${isVertical ? 20 : 26}px; font-weight: 700; text-align: center; background: #000000; padding: 8px 14px; border-radius: 4px; margin: 0; }`,
          width: isVertical ? 600 : 1200,
          height: 100,
        },
        start: palavraAtual.start,
        length: Math.max(palavraAtual.end - palavraAtual.start, 0.12),
        position: 'bottom',
        offset: { y: 0.08 },
      });
    });
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
  return { status: data.response.status, videoUrl: data.response.url || null };
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
