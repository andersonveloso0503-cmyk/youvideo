// lib/tudoNaFal.js
// "Tudo na fal": desvia para a fal.ai (uma chave só, a FAL_KEY) as chamadas
// que o painel faz hoje para o Groq (texto e transcrição) e para a Black Forest Labs (imagens Flux),
// SEM precisar mexer em nenhuma tela ou rota do painel.
//
// Como liga: na Vercel, crie a variável TUDO_NA_FAL = 1 (e mantenha a FAL_KEY que você já tem).
// Como desliga: apague a variável (ou coloque 0) e faça redeploy. Tudo volta a ser como antes.
//
// Segurança: se a fal.ai der qualquer erro, a chamada cai automaticamente no provedor antigo
// (Groq / BFL), então nada para de funcionar enquanto você testa.
//
// Opcional: FAL_MODELO_TEXTO = um modelo do catálogo da OpenRouter (ex.: google/gemini-2.5-flash)
// para usar o MESMO modelo em todos os roteiros/títulos. Sem ela, cada tela usa o modelo de sempre.

const MARCA = Symbol.for('youvideo.tudoNaFal.fetchOriginal');

const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRICAO = 'https://api.groq.com/openai/v1/audio/transcriptions';
const BFL_FLUX = 'https://api.bfl.ai/v1/flux-2-pro';
const POLL_FALSO = 'https://tudo-na-fal.interno/pronto';

const FAL_CHAT = 'https://fal.run/openrouter/router/openai/v1/chat/completions';
const FAL_FLUX = 'https://fal.run/fal-ai/flux-2-pro';
const FAL_FLUX_EDIT = 'https://fal.run/fal-ai/flux-2-pro/edit';
const FAL_WHISPER = 'https://fal.run/fal-ai/whisper';

// Nomes de modelo do Groq -> nome equivalente no catálogo da OpenRouter (usado pela fal)
const MAPA_MODELOS = {
  'openai/gpt-oss-20b': 'openai/gpt-oss-20b',
  'openai/gpt-oss-120b': 'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile': 'meta-llama/llama-3.3-70b-instruct',
  'llama-3.1-8b-instant': 'meta-llama/llama-3.1-8b-instruct',
};

export function tudoNaFalAtivo() {
  return process.env.TUDO_NA_FAL === '1' && !!process.env.FAL_KEY;
}

export function tudoNaFalInstalado() {
  return !!globalThis[MARCA];
}

function falHeaders() {
  return { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' };
}

function respostaJson(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function mensagemErro(d, status) {
  if (!d) return `fal.ai respondeu ${status}`;
  if (typeof d.detail === 'string') return d.detail;
  if (Array.isArray(d.detail)) return d.detail.map((x) => x.msg || JSON.stringify(x)).join(' | ');
  return d.error?.message || d.error || d.message || `fal.ai respondeu ${status}`;
}

// ---------- Texto (roteiros, títulos, descrições, tags...) ----------
async function chatNaFal(fetchOriginal, init) {
  const corpo = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
  if (corpo.stream) throw new Error('streaming não suportado no desvio');
  const modeloFixo = (process.env.FAL_MODELO_TEXTO || '').trim();
  corpo.model = modeloFixo || MAPA_MODELOS[corpo.model] || corpo.model;

  const r = await fetchOriginal(FAL_CHAT, { method: 'POST', headers: falHeaders(), body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(mensagemErro(d, r.status));
  const pronto = d?.choices ? d : d?.output?.choices ? d.output : null;
  if (!pronto?.choices?.length) throw new Error('resposta de texto da fal veio vazia');
  return respostaJson(pronto);
}

// ---------- Imagens (Flux 2 Pro, com ou sem imagem de referência) ----------
function comoUrlDeImagem(valor) {
  const s = String(valor || '');
  if (/^https?:\/\//.test(s) || s.startsWith('data:')) return s;
  return `data:image/jpeg;base64,${s}`; // a BFL aceitava base64 puro
}

async function fluxNaFal(fetchOriginal, init) {
  const corpo = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
  const refs = Object.keys(corpo)
    .filter((k) => /^input_image(_\d+)?$/.test(k) && corpo[k])
    .sort((a, b) => (Number(a.split('_')[2]) || 1) - (Number(b.split('_')[2]) || 1))
    .map((k) => comoUrlDeImagem(corpo[k]));

  const tolerancia = Math.min(5, Math.max(1, Number(corpo.safety_tolerance ?? 2) || 2));
  const input = {
    prompt: corpo.prompt,
    output_format: corpo.output_format === 'png' ? 'png' : 'jpeg',
    safety_tolerance: String(tolerancia),
  };
  if (corpo.width && corpo.height) input.image_size = { width: Number(corpo.width), height: Number(corpo.height) };
  if (corpo.seed != null) input.seed = Number(corpo.seed);
  if (refs.length) input.image_urls = refs;

  const r = await fetchOriginal(refs.length ? FAL_FLUX_EDIT : FAL_FLUX, {
    method: 'POST',
    headers: falHeaders(),
    body: JSON.stringify(input),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(mensagemErro(d, r.status));

  const barrada = Array.isArray(d?.has_nsfw_concepts) && d.has_nsfw_concepts[0] === true;
  const url = d?.images?.[0]?.url;
  if (!barrada && !url) throw new Error('a fal não devolveu imagem');

  // As telas esperam o formato da BFL: { polling_url } e depois { status: 'Ready', result: { sample } }.
  // O link de "acompanhamento" já carrega o resultado dentro dele, então não depende de memória.
  const q = barrada ? 'barrada=1' : `u=${encodeURIComponent(url)}`;
  return respostaJson({ id: `fal-${Date.now()}`, polling_url: `${POLL_FALSO}?${q}` });
}

function pollFalso(url) {
  const p = new URL(url).searchParams;
  if (p.get('barrada')) return respostaJson({ status: 'Content Moderated' });
  const sample = p.get('u');
  if (!sample) return respostaJson({ status: 'Error' });
  return respostaJson({ status: 'Ready', result: { sample } });
}

// ---------- Transcrição de áudio (Whisper) ----------
async function transcricaoNaFal(fetchOriginal, init) {
  const form = init.body;
  if (!form || typeof form.get !== 'function') throw new Error('transcrição sem arquivo');
  const arquivo = form.get('file');
  if (!arquivo || typeof arquivo.arrayBuffer !== 'function') throw new Error('transcrição sem arquivo');
  if (!process.env.MEDIA_READ_WRITE_TOKEN) throw new Error('MEDIA_READ_WRITE_TOKEN não configurado');

  // A fal precisa de um link para o áudio: sobe uma cópia temporária no Vercel Blob
  const { put, del } = await import('@vercel/blob');
  const blob = await put(`transcricao-tmp/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
    Buffer.from(await arquivo.arrayBuffer()), {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });

  try {
    const querPalavras = (form.getAll('timestamp_granularities[]') || []).includes('word');
    const input = { audio_url: blob.url, task: 'transcribe', chunk_level: querPalavras ? 'word' : 'segment' };
    const idioma = form.get('language');
    if (idioma) input.language = String(idioma);

    const r = await fetchOriginal(FAL_WHISPER, { method: 'POST', headers: falHeaders(), body: JSON.stringify(input) });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(mensagemErro(d, r.status));

    const pedacos = (d?.chunks || []).map((c) => ({
      text: String(c.text || '').trim(),
      start: Array.isArray(c.timestamp) ? Number(c.timestamp[0]) || 0 : 0,
      end: Array.isArray(c.timestamp) ? Number(c.timestamp[1] ?? c.timestamp[0]) || 0 : 0,
    }));
    // Mesmo formato que o Groq devolve em verbose_json
    return respostaJson({
      text: String(d?.text || ''),
      language: String(d?.inferred_languages?.[0] || idioma || ''),
      words: querPalavras ? pedacos.map((p) => ({ word: p.text, start: p.start, end: p.end })) : undefined,
      segments: querPalavras ? undefined : pedacos,
    });
  } finally {
    del(blob.url, { token: process.env.MEDIA_READ_WRITE_TOKEN }).catch(() => {});
  }
}

// ---------- Instalação ----------
export function instalarTudoNaFal() {
  if (globalThis[MARCA] || typeof globalThis.fetch !== 'function') return;
  const fetchOriginal = globalThis.fetch.bind(globalThis);
  globalThis[MARCA] = fetchOriginal;

  globalThis.fetch = async function fetchTudoNaFal(entrada, init = {}) {
    const url = typeof entrada === 'string' ? entrada : entrada?.url || String(entrada);

    // Links de acompanhamento falsos sempre são respondidos aqui (mesmo se desligarem no meio)
    if (url.startsWith(POLL_FALSO)) return pollFalso(url);
    if (!tudoNaFalAtivo()) return fetchOriginal(entrada, init);

    try {
      if (url === GROQ_CHAT) return await chatNaFal(fetchOriginal, init);
      if (url === GROQ_TRANSCRICAO) return await transcricaoNaFal(fetchOriginal, init);
      if (url === BFL_FLUX && (init.method || 'GET').toUpperCase() === 'POST') return await fluxNaFal(fetchOriginal, init);
    } catch (err) {
      console.warn(`[tudo-na-fal] fal falhou (${url}): ${err.message} — usando o provedor antigo`);
    }
    return fetchOriginal(entrada, init);
  };
}
