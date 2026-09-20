import { put } from '@vercel/blob';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };
export const maxDuration = 300;

// A D-ID só aceita até 5 minutos de áudio por chamada. Deixamos uma margem
// de segurança (280s em vez de 300s) pra não estourar por causa de
// arredondamento na hora de cortar o áudio.
const LIMITE_AUDIO_DID_SEGUNDOS = 280;

export default async function handler(req, res) {
  if (req.method === 'GET') return checarMontagem(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imagemUrl, audioUrl } = req.body;

  if (!imagemUrl) return res.status(400).json({ error: 'imagemUrl é obrigatória (a foto/referência do personagem)' });
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl é obrigatória (a música já enviada)' });
  if (!process.env.DID_API_KEY) {
    return res.status(500).json({
      error: 'DID_API_KEY não configurada ainda. Crie conta em d-id.com, pegue a API key (formato "Basic ...") e adicione no Vercel.',
    });
  }
  if (!process.env.SHOTSTACK_API_KEY) {
    return res.status(500).json({ error: 'SHOTSTACK_API_KEY não configurada ainda.' });
  }

  const env = process.env.SHOTSTACK_ENV === 'production' ? 'v1' : 'stage';
  const base = `https://api.shotstack.io/edit/${env}`;

  try {
    // 1) Descobre a duração total da música e divide em blocos de até
    // LIMITE_AUDIO_DID_SEGUNDOS (a D-ID não aceita áudio mais longo que isso).
    // A maioria das músicas (até ~4-5min) sai num bloco só — sem precisar
    // escolher trecho nenhum na mão.
    const duracaoTotal = await probarDuracao(audioUrl, base);
    const blocos = [];
    let inicio = 0;
    while (inicio < duracaoTotal) {
      const duracaoBloco = Math.min(LIMITE_AUDIO_DID_SEGUNDOS, duracaoTotal - inicio);
      blocos.push({ inicio, duracao: duracaoBloco });
      inicio += duracaoBloco;
    }

    // 2) Corta cada bloco do áudio original (Shotstack faz o corte e devolve
    // um mp3 só com aquele pedaço).
    const orcamentoTotalMs = 260000; // margem dentro do maxDuration (300s)
    const orcamentoPorEtapaMs = Math.floor(orcamentoTotalMs / (blocos.length * 2)); // corte + D-ID por bloco

    const audiosCortados = [];
    for (const bloco of blocos) {
      const url = await cortarAudioShotstack(audioUrl, bloco.inicio, bloco.duracao, base, orcamentoPorEtapaMs);
      audiosCortados.push(url);
    }

    // 3) Manda cada bloco pra D-ID sincronizar a boca do personagem.
    const clipesUrls = [];
    for (const audioBlocoUrl of audiosCortados) {
      const videoUrl = await gerarTalkDID(imagemUrl, audioBlocoUrl, orcamentoPorEtapaMs);
      clipesUrls.push(videoUrl);
    }

    // Só 1 bloco: já é o vídeo final.
    if (clipesUrls.length === 1) {
      return res.status(200).json({ videoUrl: clipesUrls[0] });
    }

    // 4) Vários blocos: junta em sequência na Shotstack (cada clipe já vem
    // com vídeo + áudio juntos, entregue pela D-ID).
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
    if (!renderRes.ok) throw new Error(renderData.message || 'Erro ao juntar os blocos do vídeo cantado na Shotstack');

    return res.status(200).json({ renderId: renderData.response.id, montandoBlocos: clipesUrls.length });
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
      throw new Error(statusData.error?.description || 'A D-ID não conseguiu gerar esse bloco (imagem ruim ou áudio incompatível?)');
    }
  }
  if (!resultUrl) {
    const segundos = Math.round((Date.now() - inicioEspera) / 1000);
    throw new Error(`Tempo esgotado esperando a D-ID terminar um dos blocos (esperei ${segundos}s, último status: "${ultimoStatus || 'desconhecido'}"). Pode ser fila cheia na D-ID — tenta de novo em alguns minutos.`);
  }

  // O link da D-ID expira em 24h — baixa e guarda no nosso próprio Blob.
  const videoRes = await fetch(resultUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const blob = await put(`cantor-virtual-${Date.now()}.mp4`, videoBuffer, {
    access: 'public',
    contentType: 'video/mp4',
    token: process.env.MEDIA_READ_WRITE_TOKEN,
  });
  return blob.url;
}

// Corta um pedaço (inicioSeg → inicioSeg+duracaoSeg) do áudio original,
// usando a Shotstack como "tesoura" — evita precisar de ffmpeg no projeto.
async function cortarAudioShotstack(audioUrl, inicioSeg, duracaoSeg, base, orcamentoMs) {
  const renderRes = await fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeline: { tracks: [{ clips: [{ asset: { type: 'audio', src: audioUrl, trim: inicioSeg }, start: 0, length: duracaoSeg }] }] },
      output: { format: 'mp3' },
    }),
  });
  const renderData = await renderRes.json();
  if (!renderRes.ok) throw new Error(renderData.message || 'Erro ao cortar um trecho do áudio na Shotstack');

  const renderId = renderData.response.id;
  const ORCAMENTO_ESPERA_MS = orcamentoMs || 60000;
  const inicioEspera = Date.now();
  while (Date.now() - inicioEspera < ORCAMENTO_ESPERA_MS) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${base}/render/${renderId}`, { headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY } });
    const statusData = await statusRes.json();
    if (statusData.response?.status === 'done') return statusData.response.url;
    if (statusData.response?.status === 'failed') {
      throw new Error(statusData.response.data?.error || 'Falha ao cortar um trecho do áudio');
    }
  }
  throw new Error('Tempo esgotado esperando a Shotstack cortar um trecho do áudio.');
}

async function probarDuracao(url, base) {
  const probeRes = await fetch(`${base}/probe/${encodeURIComponent(url)}`, {
    headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY },
  });
  const data = await probeRes.json();
  if (!probeRes.ok) throw new Error(data.message || 'Erro ao consultar a duração de um dos arquivos');
  const duracao = parseFloat(data.response?.metadata?.streams?.[0]?.duration);
  if (!duracao) throw new Error('Não consegui identificar a duração de um dos arquivos');
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
