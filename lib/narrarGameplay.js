// "Narrar gameplay" (canal Próxima Fase): o dono grava uma partida, o Compilador sobe o vídeo,
// o Gemini ASSISTE e conta o que acontece em cada momento, o Claude escreve uma narração jovem e engraçada
// sincronizada com a tela, a ElevenLabs fala, e o PC monta o Short (sem o áudio original, com trilha livre e legenda).

import { CLAUDE_URL, modeloClaude } from './textoNoClaude';
import { vozDosGames } from './games';
import { palavrasDoAlinhamento, musicaDeFundo } from './documentario';

export const COLECAO_NARRACOES = 'youvideo_narracoes';
const GEMINI = 'https://generativelanguage.googleapis.com';

export const ESTILOS = {
  jogadora: {
    nome: 'A própria jogadora falando',
    feminina: true,
    instrucao:
      'Quem fala é a PRÓPRIA JOGADORA, uma garota jovem e engraçada, em primeira pessoa ("gente, olha eu aqui...", "não, não, não, ele me viu!"). ' +
      'Reage ao que acontece na hora, faz piada de si mesma, fica nervosa nos momentos de perigo e comemora quando dá certo.',
  },
  narrador: {
    nome: 'Narrador jovem e zoeiro',
    feminina: false,
    instrucao:
      'Quem fala é um NARRADOR jovem e zoeiro, comentando a partida de fora, como amigo assistindo ("olha ela achando que tá escondida...", "corre, CORRE!"). ' +
      'Faz piada com as escolhas do jogador, cria suspense e reage alto nos momentos de perigo.',
  },
};

// ───────────────────────── 1. Gemini assiste a partida ─────────────────────────

async function subirParaGemini(videoUrl, key) {
  const v = await fetch(videoUrl);
  if (!v.ok) throw new Error(`Não consegui pegar o vídeo (${v.status}).`);
  const bytes = Buffer.from(await v.arrayBuffer());
  const ini = await fetch(`${GEMINI}/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': 'video/mp4',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'gameplay' } }),
  });
  const urlEnvio = ini.headers.get('x-goog-upload-url');
  if (!ini.ok || !urlEnvio) throw new Error(`Gemini não aceitou o vídeo (${ini.status}).`);
  const env = await fetch(urlEnvio, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  });
  const arq = (await env.json().catch(() => null))?.file;
  if (!env.ok || !arq?.name) throw new Error('O envio do vídeo para o Gemini falhou.');
  // Espera o Gemini terminar de processar o vídeo
  for (let i = 0; i < 40; i++) {
    const s = await (await fetch(`${GEMINI}/v1beta/${arq.name}?key=${key}`)).json();
    if (s.state === 'ACTIVE') return s;
    if (s.state === 'FAILED') throw new Error('O Gemini não conseguiu ler o vídeo.');
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  throw new Error('O Gemini demorou demais para processar o vídeo. Tente de novo.');
}

/** Devolve { jogo, resumo, momentos: [{ t, oQue }] } com o que acontece na partida. */
export async function analisarGameplay(videoUrl, { jogo = '', duracao = 0 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada na Vercel.');
  const arq = await subirParaGemini(videoUrl, key);
  const modelos = [...new Set([process.env.GEMINI_VIDEO_MODEL, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'].filter(Boolean))];
  const pedido =
    `Assista a esta gravação de gameplay${jogo ? ` do jogo ${jogo}` : ''} (duração: ${Math.round(duracao)} segundos). ` +
    'Descreva em português do Brasil, em ordem, TUDO o que acontece, com o segundo exato de cada momento, a cada 3 a 5 segundos: ' +
    'o que o jogador faz, onde está, perigos, inimigos, sustos, acertos, erros, momentos engraçados e o que aparece na tela (placar, contadores, avisos). ' +
    'Ignore textos de legenda e letras de música que estejam escritos no vídeo. Não invente nada que não aparece. ' +
    'Responda só JSON: {"jogo":"nome do jogo","modo":"modo ou mapa, se der para saber","resumo":"2 frases","momentos":[{"t":0,"oQue":"..."}]}';
  let d = null;
  let ultimoErro = '';
  for (const modelo of modelos) {
    const r = await fetch(`${GEMINI}/v1beta/models/${modelo}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ file_data: { mime_type: arq.mimeType || 'video/mp4', file_uri: arq.uri } }, { text: pedido }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok) {
      d = j;
      break;
    }
    ultimoErro = j?.error?.message || `Gemini respondeu ${r.status}`;
  }
  if (!d) throw new Error(`O Gemini não conseguiu assistir o vídeo: ${ultimoErro}`);
  const txt = (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  fetch(`${GEMINI}/v1beta/${arq.name}?key=${key}`, { method: 'DELETE' }).catch(() => {}); // não deixa o vídeo guardado lá
  return {
    jogo: String(j.jogo || jogo || '').slice(0, 80),
    modo: String(j.modo || '').slice(0, 80),
    resumo: String(j.resumo || '').slice(0, 400),
    momentos: (j.momentos || []).map((m) => ({ t: Math.max(0, Number(m.t) || 0), oQue: String(m.oQue || m.o_que || '').slice(0, 300) })).filter((m) => m.oQue),
  };
}

// Efeitos sonoros animados (estilo Shorts): feitos UMA vez na ElevenLabs (efeitos de som) e reaproveitados em todos os vídeos
export const EFEITOS = {
  susto: { s: 1.5, texto: 'short cartoon scare sting, sudden dramatic orchestral hit, comedic horror' },
  risada: { s: 2.2, texto: 'short funny cartoon laugh, playful giggles, comedic' },
  whoosh: { s: 0.8, texto: 'quick cartoon whoosh swipe, fast transition' },
  plim: { s: 1.0, texto: 'bright cartoon ding, success chime, cheerful' },
  fail: { s: 2.2, texto: 'funny sad trombone, wah wah wah fail sound, comedic' },
  alarme: { s: 1.6, texto: 'short cartoon alarm siren, urgent and funny' },
  vitoria: { s: 2.4, texto: 'short video game victory fanfare, level complete jingle' },
  suspense: { s: 2.2, texto: 'short tense suspense riser, dramatic build up' },
  boing: { s: 0.8, texto: 'cartoon boing spring bounce sound' },
  impacto: { s: 1.2, texto: 'deep dramatic boom impact, cinematic hit' },
  correr: { s: 1.6, texto: 'cartoon running feet scurrying fast, comedic' },
};

/** URL do efeito (gera na primeira vez e guarda). null se não der: o vídeo sai sem aquele efeito. */
export async function urlDoEfeito(tipo) {
  const ef = EFEITOS[tipo];
  if (!ef || !process.env.ELEVENLABS_API_KEY) return null;
  let ref = null;
  try {
    const { getDb } = await import('./firebase-admin');
    ref = getDb().collection('youvideo_config').doc('narrar_efeitos');
    const salvo = (await ref.get()).data();
    if (salvo?.[tipo]) return salvo[tipo];
  } catch {
    /* sem banco: gera de novo */
  }
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify({ text: ef.texto, duration_seconds: ef.s, prompt_influence: 0.6 }),
    });
    if (!r.ok) return null;
    const { put } = await import('@vercel/blob');
    const blob = await put(`narrar-efeito-${tipo}.mp3`, Buffer.from(await r.arrayBuffer()), {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    if (ref) await ref.set({ [tipo]: blob.url }, { merge: true }).catch(() => {});
    return blob.url;
  } catch {
    return null;
  }
}

/** Os efeitos da narração como pedaços de áudio da receita (volume um pouco abaixo da voz). */
export async function audioDosEfeitos(efeitos, duracao) {
  const tipos = [...new Set((efeitos || []).map((e) => e.tipo))];
  const urls = Object.fromEntries(await Promise.all(tipos.map(async (t) => [t, await urlDoEfeito(t)])));
  return (efeitos || [])
    .filter((e) => urls[e.tipo] && e.t < duracao - 0.3)
    .map((e) => ({ url: urls[e.tipo], start: Number(e.t.toFixed(2)), length: Number(Math.min(EFEITOS[e.tipo].s, duracao - e.t).toFixed(2)), volume: 0.75 }));
}

// ───────────────────────── 2. Claude escreve a narração ─────────────────────────

async function textoJson(sistema, usuario) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (key) {
    const r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model: modeloClaude(), max_tokens: 4000, system: sistema, messages: [{ role: 'user', content: usuario }] }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      const t = (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    }
  }
  // Reserva: Groq
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY || ''}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.9, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }] }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error?.message || `IA respondeu ${r.status}`);
  return JSON.parse(d.choices[0].message.content);
}

/** Devolve { titulo, descricao, tags, falas: [{ t, texto }] } com a narração sincronizada. */
export async function escreverNarracao(analise, { estilo = 'narrador', duracao = 60 } = {}) {
  const e = ESTILOS[estilo] || ESTILOS.narrador;
  const palavras = Math.round(duracao * 2.1);
  const j = await textoJson(
    'Você escreve narrações para Shorts de gameplay do canal brasileiro de games "Próxima Fase". ' +
      e.instrucao +
      ' Português do Brasil, jeito jovem e natural, gírias leves, nada de palavrão nem ofensa. ' +
      'Cada fala tem o segundo em que começa ("t") e combina EXATAMENTE com o que está na tela naquele momento (use a linha do tempo). ' +
      'Falas curtas (5 a 18 palavras), com respiros entre elas: não precisa narrar todo segundo. A primeira fala, em t=0, é um gancho forte. ' +
      'INSCRIÇÃO: logo DEPOIS do momento mais engraçado ou mais tenso da partida (nunca no começo), uma fala curta e natural pede para se inscrever, ' +
      'ligada ao que acabou de acontecer (ex.: "se você riu dessa, se inscreve que amanhã tem mais"). Só uma vez no vídeo. ' +
      'FINAL: a última fala faz um GANCHO para o próximo vídeo e pede comentário, com variedade (ex.: "se esse vídeo passar de mil curtidas, eu mostro a partida em que eu perdi feio", ' +
      '"comenta qual jogo vocês querem ver amanhã"). Não prometa nada impossível de cumprir. Não invente o que não acontece. ' +
      `Total aproximado: ${palavras} palavras. ` +
      `Coloque também de 5 a 9 EFEITOS SONOROS animados nos momentos certos (susto, perigo, erro, acerto, fuga, comemoração), só destes tipos: ${Object.keys(EFEITOS).join(', ')}. ` +
      'Efeito combina com o que aparece na tela naquele segundo e não fica em cima de outro efeito. ' +
      'Responda só JSON: {"titulo":"título do Short, até 80 caracteres, sem hashtag","descricao":"2 frases para a descrição","tags":["8 tags"],"falas":[{"t":0,"texto":"..."}],"efeitos":[{"t":3,"tipo":"susto"}]}',
    `Jogo: ${analise.jogo}${analise.modo ? ` (${analise.modo})` : ''}\nDuração do vídeo: ${Math.round(duracao)} s\nResumo: ${analise.resumo}\n\nLinha do tempo:\n` +
      analise.momentos.map((m) => `${m.t.toFixed(0)}s: ${m.oQue}`).join('\n')
  );
  const falas = (j.falas || [])
    .map((f) => ({ t: Math.max(0, Math.min(duracao - 1, Number(f.t) || 0)), texto: String(f.texto || '').replace(/\s+/g, ' ').trim() }))
    .filter((f) => f.texto)
    .sort((a, b) => a.t - b.t);
  if (!falas.length) throw new Error('A IA não escreveu a narração. Tente de novo.');
  return {
    titulo: String(j.titulo || `${analise.jogo}: olha essa partida!`).slice(0, 80),
    descricao: String(j.descricao || analise.resumo || '').slice(0, 600),
    tags: (j.tags || []).map(String).slice(0, 10),
    falas,
    efeitos: (j.efeitos || [])
      .map((x) => ({ t: Math.max(0, Math.min(duracao - 0.5, Number(x.t) || 0)), tipo: String(x.tipo || '').toLowerCase().trim() }))
      .filter((x) => EFEITOS[x.tipo])
      .sort((a, b) => a.t - b.t)
      .filter((x, i, arr) => i === 0 || x.t - arr[i - 1].t >= 1.5) // nunca um efeito em cima do outro
      .slice(0, 10),
  };
}

// ───────────────────────── 3. Voz (ElevenLabs) e receita para o PC ─────────────────────────

/**
 * Gera a voz de cada fala (com o tempo de cada palavra, para a legenda) e devolve
 * { audio: [{ url, start, length }], palavras: [{ texto, start, end }] }.
 * Uma fala nunca encosta na outra: se a anterior ainda não terminou, a próxima espera.
 */
export async function vozDasFalas(falas, { estilo = 'narrador', vozId = '', duracao = 60 } = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY não configurada na Vercel.');
  const e = ESTILOS[estilo] || ESTILOS.narrador;
  const voz = vozId || (await vozDosGames({ feminina: e.feminina }).catch(() => null)) || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const { put } = await import('@vercel/blob');
  const audio = [];
  const palavras = [];
  let livreEm = 0;
  for (let i = 0; i < falas.length; i++) {
    const f = falas[i];
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/with-timestamps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text: f.texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true, speed: 1.08 },
        ...(i > 0 ? { previous_text: falas[i - 1].texto } : {}),
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      if (/quota|credits|limit/i.test(txt)) throw new Error('Acabaram os créditos da ElevenLabs (voz).');
      throw new Error(`Voz, fala ${i + 1}: ${txt.slice(0, 160)}`);
    }
    const d = await r.json();
    const pal = palavrasDoAlinhamento(d.alignment);
    const fim = Math.max(pal.length ? pal[pal.length - 1].end : 0, ...(d.alignment?.character_end_times_seconds || [0]));
    const inicio = Math.max(f.t, livreEm);
    if (inicio >= duracao - 0.3) break; // não cabe mais no vídeo
    const blob = await put(`narrar-voz-${Date.now()}-${i}.mp3`, Buffer.from(d.audio_base64, 'base64'), {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });
    const length = Math.min(fim + 0.15, duracao - inicio);
    audio.push({ url: blob.url, start: Number(inicio.toFixed(2)), length: Number(length.toFixed(2)) });
    for (const p of pal) if (p.start + inicio < duracao) palavras.push({ texto: p.texto, start: Number((p.start + inicio).toFixed(2)), end: Number(Math.min(duracao, p.end + inicio).toFixed(2)) });
    livreEm = inicio + fim + 0.25;
  }
  return { audio, palavras };
}

/** Música de fundo do Short narrado (instrumental, feita uma vez no Lyria e reaproveitada). */
export function musicaDaNarracao() {
  return musicaDeFundo('Playful but tense electronic background music for a funny video game commentary, light synth bass and drums, upbeat, loopable', 'games');
}
