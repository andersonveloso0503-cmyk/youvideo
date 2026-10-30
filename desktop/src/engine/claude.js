// Texto no Claude (app de PC): os títulos, descrições, tags e capas que hoje saem do Groq
// passam a sair do Claude (API da Anthropic), sem mexer no resto do app.
// Liga sozinho quando a chave do Claude está em Configurações. Sem a chave, tudo continua no Groq.
// Se o Claude falhar (sem crédito, fora do ar, limite), a chamada cai no Groq de sempre.
// A legenda (transcrição de áudio) continua no Groq: o Claude não transcreve áudio.

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'claude-haiku-5-5';
const TETO_SAIDA = 32000;
const MARCA = Symbol.for('youvideo.compilador.textoNoClaude');

function textoDe(conteudo) {
  if (typeof conteudo === 'string') return conteudo;
  if (Array.isArray(conteudo)) {
    return conteudo
      .map((p) => (typeof p === 'string' ? p : p?.type === 'text' ? p.text || '' : ''))
      .filter(Boolean)
      .join('\n');
  }
  return conteudo == null ? '' : String(conteudo);
}

function paraClaude(corpo) {
  const sistema = [];
  const mensagens = [];
  for (const m of corpo.messages || []) {
    const texto = textoDe(m.content);
    if (m.role === 'system' || m.role === 'developer') {
      if (texto.trim()) sistema.push(texto);
      continue;
    }
    if (!texto.trim()) continue;
    const papel = m.role === 'assistant' ? 'assistant' : 'user';
    const ultima = mensagens[mensagens.length - 1];
    if (ultima && ultima.role === papel) ultima.content += `\n\n${texto}`;
    else mensagens.push({ role: papel, content: texto });
  }
  if (!mensagens.length || mensagens[0].role !== 'user') mensagens.unshift({ role: 'user', content: 'Siga as instruções.' });
  if (mensagens[mensagens.length - 1].role === 'assistant') mensagens.push({ role: 'user', content: 'Continue.' });

  const tipo = corpo.response_format?.type;
  const querJson = tipo === 'json_object' || tipo === 'json_schema';
  if (querJson) {
    sistema.push('FORMATO OBRIGATÓRIO: responda somente com um objeto JSON válido. Nada de texto antes ou depois, nada de ``` e nada de comentários. Escape corretamente as aspas dentro dos textos.');
  }
  const pedido = Number(corpo.max_completion_tokens || corpo.max_tokens) || 8192;
  const req = { model: MODELO, max_tokens: Math.min(TETO_SAIDA, Math.max(256, pedido)), messages: mensagens };
  if (sistema.length) req.system = sistema.join('\n\n');
  if (corpo.temperature != null && !Number.isNaN(Number(corpo.temperature))) {
    req.temperature = Math.min(1, Math.max(0, Number(corpo.temperature)));
  }
  const paradas = (Array.isArray(corpo.stop) ? corpo.stop : corpo.stop ? [corpo.stop] : []).filter((s) => typeof s === 'string' && s.trim());
  if (paradas.length) req.stop_sequences = paradas.slice(0, 4);
  return { req, querJson };
}

function limparJson(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  return ini >= 0 && fim > ini ? t.slice(ini, fim + 1) : t;
}

function paraOpenAI(d, querJson) {
  let texto = (d?.content || []).filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  if (querJson) texto = limparJson(texto);
  if (!texto.trim()) throw new Error(d?.stop_reason === 'refusal' ? 'o Claude recusou o pedido' : 'resposta do Claude veio vazia');
  const fim = { end_turn: 'stop', stop_sequence: 'stop', max_tokens: 'length', refusal: 'content_filter' }[d?.stop_reason] || 'stop';
  const entrada = d?.usage?.input_tokens || 0;
  const saida = d?.usage?.output_tokens || 0;
  return {
    id: d?.id || `claude-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: d?.model || MODELO,
    choices: [{ index: 0, message: { role: 'assistant', content: texto }, finish_reason: fim }],
    usage: { prompt_tokens: entrada, completion_tokens: saida, total_tokens: entrada + saida },
  };
}

/** Liga o desvio. pegarChave = função que devolve a chave do Claude salva em Configurações. */
function instalarTextoNoClaude(pegarChave) {
  if (globalThis[MARCA] || typeof globalThis.fetch !== 'function') return;
  const fetchOriginal = globalThis.fetch.bind(globalThis);
  globalThis[MARCA] = fetchOriginal;

  globalThis.fetch = async function fetchTextoNoClaude(entrada, init = {}) {
    const url = typeof entrada === 'string' ? entrada : entrada?.url || String(entrada);
    if (url !== GROQ_CHAT) return fetchOriginal(entrada, init);
    let chave = '';
    try {
      chave = String(pegarChave() || '').trim();
    } catch {}
    if (!chave) return fetchOriginal(entrada, init);
    try {
      const corpo = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
      if (corpo.stream) throw new Error('streaming não suportado');
      const { req, querJson } = paraClaude(corpo);
      const r = await fetchOriginal(CLAUDE_URL, {
        method: 'POST',
        headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: init.signal,
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error?.message || `Claude respondeu ${r.status}`);
      return new Response(JSON.stringify(paraOpenAI(d, querJson)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      if (init.signal?.aborted) throw err;
      console.warn(`[texto-no-claude] Claude falhou: ${err.message} — usando o Groq`);
      return fetchOriginal(entrada, init);
    }
  };
}

module.exports = { instalarTextoNoClaude };
