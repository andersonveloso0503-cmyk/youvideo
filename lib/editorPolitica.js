// EDITOR-CHEFE dos Shorts de POLÍTICA (pedido do dono, 15/11: "mais acertos que erros, mais conferência antes de subir").
// Roda logo depois que o roteiro é escrito e ANTES de gastar com voz, imagens e montagem:
//   1. Um modelo forte (Claude Sonnet) lê o roteiro junto com a notícia e dá NOTA de 0 a 10.
//   2. Confere: gancho no assunto principal, toda fala sobre o assunto, promessa sem resposta, frase genérica,
//      fato que não está na notícia, imagem de cada cena mostrando o que a frase fala (pessoa só se citada).
//   3. Nota abaixo de 8: ele mesmo devolve a versão corrigida, que é conferida de novo (no máximo 2 rodadas).
//   4. Se ainda ficar abaixo de 7, o roteiro NÃO entra na aprovação automática (só sai se o dono mandar).
// Se o Claude estiver fora do ar, o roteiro segue como antes (nunca trava a fábrica).
import { CLAUDE_URL } from './textoNoClaude';
import { ia } from './gamesNoticias';

const MODELO = () => (process.env.CLAUDE_MODELO_EDITOR || '').trim() || 'claude-sonnet-5-5';
export const NOTA_BOA = 8;
export const NOTA_MINIMA_AUTO = 7;

function jsonDe(txt) {
  const t = String(txt || '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('resposta sem JSON');
  return JSON.parse(t.slice(a, b + 1));
}

/** Chamada direta ao Claude (modelo forte), resposta em JSON. */
export async function claudeJson(sistema, usuario, { modelo = MODELO(), maxTokens = 4000, timeout = 120000 } = {}) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('sem ANTHROPIC_API_KEY');
  const r = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: modelo,
      max_tokens: maxTokens,
      system: `${sistema}\n\nFORMATO OBRIGATÓRIO: responda somente com um objeto JSON válido, sem texto antes ou depois e sem \`\`\`.`,
      messages: [{ role: 'user', content: usuario }],
    }),
    signal: AbortSignal.timeout(timeout),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok && /credit balance is too low/i.test(String(d?.error?.message || ''))) await import('./freioProducao').then((f) => f.marcarSemCredito(d.error.message)).catch(() => {}); // 18/11: pausa vídeos novos
  if (!r.ok) throw new Error(d?.error?.message || `Claude ${r.status}`);
  return jsonDe((d.content || []).map((p) => p.text || '').join(''));
}

/** Escreve com o modelo forte; se ele falhar, cai no caminho de sempre (ia). */
export async function iaForte(sistema, usuario) {
  try {
    return await claudeJson(sistema, usuario);
  } catch (e) {
    console.log(`[editor-politica] modelo forte falhou, usando o padrão: ${String(e.message || e).slice(0, 120)}`);
    return ia(sistema, usuario);
  }
}

const palavras = (cenas) => (cenas || []).map((c) => String(c?.texto || '')).join(' ').split(/\s+/).filter(Boolean).length;

const SISTEMA_EDITOR =
  'Você é o EDITOR-CHEFE de um canal brasileiro IMPARCIAL de Shorts de notícias de política. O dono quer vídeos EXCELENTES e está cansado de: ' +
  'falas que não têm a ver com o assunto, imagens que não mostram o que está sendo falado, promessa que o vídeo não cumpre e texto com cara de robô. ' +
  'Seu padrão de qualidade é um Short explicativo nota 10: gancho que fala com o bolso/vida de quem assiste sobre o ASSUNTO PRINCIPAL, explicação em ordem (um ponto por cena), ' +
  'o que NÃO muda ou o que cada lado diz, o que acontece agora, resumo de 1 frase e pedido de comentário com motivo. ' +
  'CONFIRA, cena por cena, com a NOTÍCIA ao lado: ' +
  '(a) a 1ª cena fala do fato central (não de um detalhe ou de uma pessoa secundária); ' +
  '(b) TODA fala é sobre o assunto da notícia e se liga à anterior (nada de frase solta, genérica ou de enchimento); ' +
  '(c) nenhuma promessa sem resposta ("fica até o fim", "o detalhe mais estranho", pergunta que nunca é respondida); ' +
  '(d) nenhum fato, número, nome ou fala que NÃO está na notícia; imparcial, sem adjetivo que toma partido; ' +
  '(e) a MÍDIA de cada cena mostra o que a frase fala: "foto de: <pessoa>" só se a frase cita a pessoa (ou continua nela); frase sobre trabalhadores, lojas, preço, lei, votação mostra isso e não o político; nada de imagem genérica; ' +
  '(f) frases curtas e naturais de falar em voz alta (como um apresentador jovem conversando, não um robô lendo); números e datas por extenso; ' +
  '(g) a última fala é uma pergunta curta sobre o assunto e termina com "Não esquece de se inscrever no canal e tocar no sininho." (sem "comenta SIM ou NÃO" e sem prometer "o que acontece depois"). ' +
  'Dê NOTA de 0 a 10 (uma casa decimal) para o roteiro RECEBIDO: 9-10 excelente, 8 bom, 6-7 fraco, abaixo de 6 refazer. Seja rigoroso, mas não invente problema. ' +
  'Se a nota for menor que 8, devolva em "cenas" a versão CORRIGIDA COMPLETA (todas as cenas, na ordem), com 100 a 125 palavras no total, 7 a 10 cenas, usando SÓ fatos da notícia, ' +
  'mantendo o formato de mídia ("imagem N", "foto de: Nome Completo", "foto real: assunto em português", "documento: SIGLA nº/ano | nome", "vídeo atual: busca em inglês com o país"). ' +
  'Se a nota for 8 ou mais, "cenas" vem vazio. ' +
  'Responda só JSON: {"nota":0-10,"problemas":["cena N: problema curto"],"titulo":"título corrigido ou vazio","thumb":"2 a 4 palavras em CAIXA ALTA ou vazio","cenas":[{"midia":"...","texto":"..."}]}';

function pedidoEditor(j, n) {
  const fotos = (n.imagens || []).map((u, i) => `imagem ${i + 1}: ${u}`).join('\n') || '(nenhuma foto da notícia)';
  return (
    `NOTÍCIA (${n.fonteNome || ''}, ${n.data || 'sem data'}):\nTítulo: ${n.titulo}\n${String(n.texto || '').slice(0, 5000)}\n\nFotos da notícia:\n${fotos}\n\n` +
    `ROTEIRO PARA REVISAR:\nTítulo: ${j.titulo || ''}\nCapa: ${j.thumb || ''}\n` +
    (j.cenas || []).map((c, i) => `CENA ${i + 1} [mídia: ${c?.midia || ''}] ${c?.texto || ''}`).join('\n')
  );
}

/**
 * Revisa o roteiro do Short (formato bruto da IA: {titulo, thumb, cenas:[{midia,texto}], ...}).
 * Devolve { j, editor:{ nota, problemas, rodadas, corrigido } } — j é o roteiro final (corrigido ou o mesmo).
 */
export async function revisarRoteiroPolitica(j, n) {
  if (!Array.isArray(j?.cenas) || !j.cenas.length) return { j, editor: null };
  let atual = j;
  let corrigido = false;
  let ultima = null;
  const historico = [];
  for (let rodada = 1; rodada <= 2; rodada++) {
    let r;
    try {
      r = await claudeJson(SISTEMA_EDITOR, pedidoEditor(atual, n), { maxTokens: 3500 });
    } catch (e) {
      console.log(`[editor-politica] não revisou (${String(e.message || e).slice(0, 120)})`);
      break;
    }
    const nota = Math.max(0, Math.min(10, Math.round(Number(r.nota) * 10) / 10));
    if (!Number.isFinite(nota)) break;
    ultima = { nota, problemas: (r.problemas || []).map(String).filter(Boolean).slice(0, 8) };
    historico.push(nota);
    console.log(`[editor-politica] "${String(atual.titulo || '').slice(0, 50)}" rodada ${rodada}: nota ${nota}${ultima.problemas.length ? ` — ${ultima.problemas.slice(0, 3).join(' | ')}` : ''}`);
    if (nota >= NOTA_BOA) break;
    const novas = Array.isArray(r.cenas) ? r.cenas.filter((c) => c && String(c.texto || '').trim()) : [];
    const total = palavras(novas);
    // Versão corrigida só entra se estiver no tamanho e completa (senão fica a anterior, com a nota baixa)
    if (novas.length < 6 || total < 85 || total > 145) break;
    atual = {
      ...atual,
      cenas: novas.map((c) => ({ midia: String(c.midia || '').trim(), texto: String(c.texto || '').trim() })),
      ...(String(r.titulo || '').trim() ? { titulo: String(r.titulo).trim() } : {}),
      ...(String(r.thumb || '').trim() ? { thumb: String(r.thumb).trim() } : {}),
    };
    corrigido = true;
    // Última rodada corrigiu, mas a versão nova ainda não tem nota: a próxima volta do laço confere
    if (rodada === 2) {
      try {
        const r2 = await claudeJson(SISTEMA_EDITOR, pedidoEditor(atual, n), { maxTokens: 1500 });
        const n2 = Math.max(0, Math.min(10, Math.round(Number(r2.nota) * 10) / 10));
        if (Number.isFinite(n2)) {
          ultima = { nota: n2, problemas: (r2.problemas || []).map(String).filter(Boolean).slice(0, 8) };
          historico.push(n2);
        }
      } catch {}
    }
  }
  return { j: atual, editor: ultima ? { ...ultima, historico, corrigido, em: new Date().toISOString() } : null };
}
