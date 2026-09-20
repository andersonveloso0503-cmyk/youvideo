import { put } from '@vercel/blob';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };
export const maxDuration = 300;

export default async function handler(req, res) {
  if (req.method === 'GET') return checarMontagem(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imagemUrl, audioUrl, audioSegments } = req.body;
  const segmentos = audioSegments?.length ? audioSegments : audioUrl ? [{ url: audioUrl }] : [];

  if (!imagemUrl) return res.status(400).json({ error: 'imagemUrl é obrigatória (a foto/referência do personagem)' });
  if (!segmentos.length) return res.status(400).json({ error: 'audioUrl ou audioSegments é obrigatório' });
  if (!process.env.DID_API_KEY) {
    return res.status(500).json({
      error: 'DID_API_KEY não configurada ainda. Crie conta em d-id.com, pegue a API key (formato "Basic ...") e adicione no Vercel.',
    });
  }

  try {
    // 1) Gera um vídeo falado por pedaço de áudio (a D-ID só aceita um
    // áudio por chamada, então uma narração longa vira vários vídeos
    // curtos aqui). O tempo de espera pela D-ID é dividido entre os
    // pedaços, dentro do teto de 300s (maxDuration) da função, com margem
    // pro resto do trabalho (baixar cada vídeo, subir no Blob, e no caso
    // de múltiplos pedaços, ainda montar tudo na Shotstack no final).
    const orcamentoPorPedacoMs = Math.floor(240000 / Math.max(segmentos.length, 1));
    const clipesUrls = [];
    for (const seg of segmentos) {
      const videoUrl = await gerarTalkDID(imagemUrl, seg.url, orcamentoPorPedacoMs);
      clipesUrls.push(videoUrl);
    }

    // Só 1 pedaço: já é o vídeo final, não precisa montar nada.
    if (clipesUrls.length === 1) {
      return res.status(200).json({ videoUrl: clipesUrls[0] });
    }

    // 2) Vários pedaços: junta em sequência na Shotstack. Cada clipe já
    // vem com vídeo E áudio juntos (a D-ID entrega isso combinado), então
    // só precisamos posicionar um atrás do outro, sem faixa de áudio
    // separada.
    const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
    const base = `https://api.shotstack.io/edit/${env}`;

    const duracoes = [];
    for (const url of clipesUrls) {
      duracoes.push(await probarDuracao(url, base));
    }

    let cursor = 0;
    const clips = clipesUrls.map((url, i) => {
      const clip = { asset: { type: 'video', src: url }, start: cursor, length: duracoes[i], fit: 'cover' };
      cursor += duracoes[i];
      return clip;
    });

    const renderRes = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeline: { tracks: [{ clips }] },
        output: { format: 'mp4', resolution: 'hd' },
      }),
    });
    const renderData = await renderRes.json();
    if (!renderRes.ok) throw new Error(renderData.message || 'Erro ao juntar os pedaços do vídeo falado na Shotstack');

    return res.status(200).json({ renderId: renderData.response.id, montandoPedacos: clipesUrls.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function gerarTalkDID(imagemUrl, audioUrl, orcamentoMs) {
  const submitRes = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: { Authorization: `Basic ${process.env.DID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_url: imagemUrl, script: { type: 'audio', audio_url: audioUrl } }),
  });
  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.description || submitData.message || 'Erro ao enviar pedido à D-ID');

  const talkId = submitData.id;
  // Sobe o teto de espera pra aproveitar melhor o maxDuration (300s) da
  // função, com uma margem de segurança pro resto do trabalho (baixar o
  // vídeo e subir no nosso Blob). Se tiver mais de 1 pedaço de áudio, cada
  // um ganha uma fatia proporcional desse orçamento, senão a soma dos
  // pedaços estoura o limite total da função.
  const ORCAMENTO_ESPERA_MS = orcamentoMs || 240000;
  const inicioEspera = Date.now();
  let resultUrl = null;
  let ultimoStatus = null;
  while (Date.now() - inicioEspera < ORCAMENTO_ESPERA_MS) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      headers: { Authorization: `Basic ${process.env.DID_API_KEY}` },
    });
    const statusData = await statusRes.json();
    ultimoStatus = statusData.status;
    if (statusData.status === 'done') {
      resultUrl = statusData.result_url;
      break;
    }
    if (statusData.status === 'error' || statusData.status === 'rejected') {
      throw new Error(statusData.error?.description || 'A D-ID não conseguiu gerar esse pedaço (imagem ruim ou áudio incompatível?)');
    }
  }
  if (!resultUrl) {
    const segundos = Math.round((Date.now() - inicioEspera) / 1000);
    throw new Error(`Tempo esgotado esperando a D-ID terminar um dos pedaços (esperei ${segundos}s, último status: "${ultimoStatus || 'desconhecido'}"). Pode ser fila cheia na D-ID — tenta de novo em alguns minutos.`);
  }

  // O link da D-ID expira em 24h — baixa e guarda no nosso próprio Blob.
  const videoRes = await fetch(resultUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const blob = await put(`avatar-falando-${Date.now()}.mp4`, videoBuffer, {
    access: 'public',
    contentType: 'video/mp4',
    token: process.env.MEDIA_READ_WRITE_TOKEN,
  });
  return blob.url;
}

async function probarDuracao(url, base) {
  const probeRes = await fetch(`${base}/probe/${encodeURIComponent(url)}`, {
    headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
  });
  const data = await probeRes.json();
  if (!probeRes.ok) throw new Error(data.message || 'Erro ao consultar a duração de um dos pedaços');
  const duracao = parseFloat(data.response?.metadata?.streams?.[0]?.duration);
  if (!duracao) throw new Error('Não consegui identificar a duração de um dos pedaços');
  return duracao;
}

async function checarMontagem(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Parâmetro id é obrigatório' });

  const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
  try {
    const statusRes = await fetch(`https://api.shotstack.io/edit/${env}/render/${id}`, {
      headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
    });
    const data = await statusRes.json();
    if (!statusRes.ok) throw new Error(data.message || 'Erro ao consultar status');
    return res.status(200).json({
      status: data.response.status,
      videoUrl: data.response.url || null,
      erro: data.response.status === 'failed' ? data.response.data?.error || 'Motivo não informado' : undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
