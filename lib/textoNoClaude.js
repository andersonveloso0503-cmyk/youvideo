// lib/textoNoClaude.js
// "Texto no Claude": faz os roteiros, títulos, descrições, tags, letras e orações saírem do Claude
// (API da Anthropic) em vez do Groq, SEM mexer em nenhuma tela ou rota do painel.
//
// Como liga: na Vercel, crie a variável ANTHROPIC_API_KEY (a chave do console.anthropic.com) e faça redeploy.
// Como desliga: apague a variável e faça redeploy. Tudo volta a ser como antes.
//
// Opcional: CLAUDE_MODELO_TEXTO = outro modelo do Claude (padrão: claude-haiku-5-5, o mais barato).
//           Ex.: claude-sonnet-5-5 escreve ainda melhor, mas custa mais.
//
// Segurança: se o Claude der qualquer erro (sem crédito, fora do ar, limite), a chamada cai
// automaticamente na fal.ai (se o "Tudo na fal" estiver ligado) e depois no Groq.
// A transcrição de áudio continua na fal/Groq (o Claude não transcreve áudio).

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MODELO_PADRAO = 'claude-haiku-5-5';
const TETO_SAIDA = 32000; // tokens de resposta no máximo (um roteiro de 25 min usa uns 6 mil)

export function claudeAtivo() {
  return !!(process.env.ANTHROPIC_API_KEY || '').trim();
}

export function modeloClaude() {
  return (process.env.CLAUDE_MODELO_TEXTO || '').trim() || MODELO_PADRAO;
}

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

/** Pedido no formato do Groq/OpenAI -> pedido no formato do Claude. */
export function paraClaude(corpo, modelo) {
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
    // O Claude não aceita duas mensagens seguidas do mesmo lado: junta
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
  const req = {
    model: modelo,
    max_tokens: Math.min(TETO_SAIDA, Math.max(256, pedido)),
    messages: mensagens,
  };
  if (sistema.length) req.system = sistema.join('\n\n');
  if (corpo.temperature != null && !Number.isNaN(Number(corpo.temperature))) {
    req.temperature = Math.min(1, Math.max(0, Number(corpo.temperature)));
  }
  const paradas = (Array.isArray(corpo.stop) ? corpo.stop : corpo.stop ? [corpo.stop] : []).filter((s) => typeof s === 'string' && s.trim());
  if (paradas.length) req.stop_sequences = paradas.slice(0, 4);
  return { req, querJson };
}

/** Tira ``` e qualquer texto em volta do JSON. */
export function limparJson(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  return ini >= 0 && fim > ini ? t.slice(ini, fim + 1) : t;
}

/** Resposta do Claude -> resposta no formato que as telas já esperam (igual à do Groq). */
export function paraOpenAI(d, querJson) {
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
    model: d?.model || '',
    choices: [{ index: 0, message: { role: 'assistant', content: texto }, finish_reason: fim }],
    usage: { prompt_tokens: entrada, completion_tokens: saida, total_tokens: entrada + saida },
  };
}

/**
 * Faz a chamada no Claude e devolve o JSON já no formato do Groq.
 * fetchFn = o fetch original (sem o desvio), para não entrar em loop.
 */
export async function chatNoClaude(fetchFn, init = {}) {
  const corpo = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
  if (corpo.stream) throw new Error('streaming não suportado no desvio');
  const { req, querJson } = paraClaude(corpo, modeloClaude());
  const r = await fetchFn(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(req),
    signal: init.signal,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error?.message || `Claude respondeu ${r.status}`);
  return paraOpenAI(d, querJson);
}
