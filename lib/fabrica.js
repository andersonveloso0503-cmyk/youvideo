// "Fábrica" de Shorts: lotes de histórias animadas e narrados criados pela fila do site
// (youvideo_fila com o campo `fabrica`), montados no PC e agendados nas redes.
import { getDb } from './firebase-admin';
import { empresa } from './empresa';

export const FUSO = '-03:00'; // horário de Brasília (sem horário de verão)

/** Data (AAAA-MM-DD) + hora (HH:MM) no horário de Brasília -> ISO. */
export function horarioBrasilia(dia, hora) {
  return new Date(`${dia}T${hora}:00${FUSO}`).toISOString();
}

export function diaBrasilia(d = new Date()) {
  return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
}

export function somarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Legenda para as redes: título + hashtags das tags do roteiro. */
export function legendaDoItem(item) {
  const titulo = item.roteiro?.titulo || item.tema || '';
  const tags = (Array.isArray(item.roteiro?.tags) ? item.roteiro.tags : String(item.roteiro?.tags || '').split(','))
    .map((t) => String(t).trim().replace(/^#/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 6);
  const hashtags = ['fe', 'jesus', ...tags].filter((t, i, a) => a.indexOf(t) === i).map((t) => `#${t}`);
  const chamada = chamadaSerie(item);
  return `${titulo}${chamada ? `\n\n${chamada}` : ''}\n\n${hashtags.join(' ')}`.slice(0, 2200);
}

// ───────── Legendas criativas (chamada para curtir, comentar, compartilhar...) ─────────
const ANGULOS = [
  'uma pergunta direta que faz a pessoa querer responder nos comentários',
  'um convite caloroso, como quem chama um amigo para ver',
  'um desafio leve ("duvido você não se emocionar", "assista até o fim")',
  'uma emoção forte em poucas palavras',
  'uma curiosidade que só se resolve assistindo',
  'uma frase de identificação ("quem nunca...", "se você já passou por isso...")',
  'um pedido para marcar ou enviar para alguém específico',
];
const ACOES = [
  'curtir e comentar uma palavra', 'compartilhar com alguém que precisa ver', 'salvar para ver de novo', 'seguir o perfil para o próximo vídeo',
  'comentar de qual cidade está assistindo', 'marcar um amigo', 'deixar um emoji nos comentários', 'mandar no grupo da família',
];
const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

/**
 * A IA escreve duas legendas curtas e criativas para o mesmo vídeo — uma para Instagram/Facebook
 * e outra para TikTok/Kwai — com gancho e chamada para ação, sem repetir o título nem a descrição.
 * Devolve { redes, celular } (sem hashtags) ou null se a IA não responder.
 */
export async function legendasCriativas({ titulo, resumo = '', obrigatorio = '', acoes = null, perfil = '' }) {
  if (!process.env.GROQ_API_KEY || !String(titulo || '').trim()) return null;
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: modelo,
        temperature: 1,
        response_format: { type: 'json_object' },
        ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        messages: [
          {
            role: 'system',
            content:
              (perfil
                ? `Você é social media de ${perfil} e escreve legendas de vídeos curtos em português do Brasil, com tom profissional, próximo e direto. `
                : 'Você é social media de um criador brasileiro e escreve legendas de vídeos curtos em português do Brasil, com jeito humano e popular. ') +
              'Responda só JSON: {"redes": "...", "celular": "..."}. ' +
              '"redes" = legenda para Instagram e Facebook: 2 ou 3 linhas curtas. "celular" = legenda para TikTok e Kwai: 1 ou 2 linhas bem diretas. ' +
              'As duas precisam ser DIFERENTES entre si. Regras: comece com um gancho criativo; NÃO repita o título e NÃO resuma a descrição; ' +
              'termine com uma chamada para ação clara e variada (curtir, comentar, compartilhar, salvar, seguir); use 1 a 3 emojis; ' +
              'sem hashtags, sem links, sem aspas, sem "confira", sem "não perca". Não invente fatos que não estão no vídeo.',
          },
          {
            role: 'user',
            content:
              `Vídeo: ${String(titulo).slice(0, 160)}
${resumo ? `Sobre o que é: ${String(resumo).replace(/#[\p{L}\p{N}_]+/gu, '').slice(0, 400)}
` : ''}` +
              `Estilo do gancho desta vez: ${sortear(ANGULOS)}.
Chamada para ação desta vez: pedir para ${sortear(acoes || ACOES)}` +
              ` (na outra legenda use outra: ${sortear(acoes || ACOES)}).` +
              (obrigatorio ? `
Inclua obrigatoriamente esta chamada, com estas palavras ou parecidas, no fim das duas: ${obrigatorio}` : ''),
          },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}');
  };
  try {
    let j;
    try {
      j = await pedir('openai/gpt-oss-20b');
    } catch {
      j = await pedir('llama-3.3-70b-versatile');
    }
    const limpa = (t) => String(t || '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/["“”]/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, 600);
    const redes = limpa(j.redes);
    const celular = limpa(j.celular);
    return redes && celular ? { redes, celular } : null;
  } catch {
    return null;
  }
}

/** Hashtags (até n) que já vêm num texto + as fixas pedidas. */
export function hashtagsDe(texto, fixas = [], n = 8) {
  const doTexto = String(texto || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...doTexto, ...fixas].filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).slice(0, n);
}

/** Série: "Siga para ver a Parte 2" (ou o aviso de final da série). Vazio se não for série. */
export function chamadaSerie(item) {
  const s = item?.serie;
  if (!s || !(s.total > 1)) return '';
  return s.parte < s.total
    ? `👉 Siga o perfil para não perder a PARTE ${s.parte + 1}! (Parte ${s.parte} de ${s.total})`
    : `✅ Final da série "${s.nome}"! Siga o perfil para a próxima história.`;
}

/**
 * Vídeo da fábrica ficou pronto: agenda Facebook/Instagram (automático) e TikTok/Kwai (celular)
 * no horário reservado. Se o horário já passou (ficou pronto atrasado), agenda para daqui a 15 min.
 * O YouTube fica para o Youvideo Compilador (sobe agendado com o canal escolhido).
 */
export async function agendarItemPronto(item, videoUrl, thumbnailUrl) {
  const f = item.fabrica || {};
  const redes = ['facebook', 'instagram', 'tiktok', 'kwai'].filter((r) => f.redes?.[r]);
  if (!redes.length) return null;
  let quando = f.quando ? new Date(f.quando) : new Date();
  if (quando.getTime() < Date.now() + 10 * 60e3) quando = new Date(Date.now() + 15 * 60e3);
  const manuais = ['kwai', 'tiktok'];
  const redesDoc = {};
  for (const r of redes) redesDoc[r] = { status: manuais.includes(r) ? 'manual' : 'pendente' };
  // Legenda criativa (gancho + chamada para curtir/comentar/compartilhar); se a IA falhar, fica a legenda simples
  const emp = item.marca ? empresa(item.marca) : null;
  const base = emp ? `${item.roteiro?.titulo || item.tema}\n\n${emp.chamadaLegenda}\n\n${emp.hashtags.join(' ')}` : legendaDoItem(item);
  const criativa = await legendasCriativas({
    titulo: item.roteiro?.titulo || item.tema,
    resumo: emp ? item.roteiro?.narracao || '' : item.roteiro?.descricao || '',
    obrigatorio: emp ? emp.chamadaLegenda : chamadaSerie(item),
    ...(emp ? { acoes: emp.acoesLegenda, perfil: `${emp.nome}, empresa de terceirização de ${emp.servicos.join(', ')} em ${emp.cidade}` } : {}),
  });
  const ref = await getDb().collection('youvideo_agenda').add({
    titulo: String(item.roteiro?.titulo || item.tema || 'Vídeo').slice(0, 150),
    legenda: criativa ? `${criativa.redes}\n\n${hashtagsDe(base, [], 8).join(' ')}`.slice(0, 2200) : base,
    legendaCelular: criativa
      ? `${criativa.celular}\n\n${hashtagsDe(base, emp ? [] : HASHTAGS_CELULAR, 8).join(' ')}`.slice(0, 2200)
      : legendaCelular(item.roteiro?.titulo || item.tema, base, chamadaSerie(item)),
    videoUrl,
    thumbnailUrl: thumbnailUrl || null,
    conta: f.conta || '', // '' = Em Nome de Jesus; 'lcs' = Página e Instagram da LCS
    curto: item.formato === 'short',
    chaveBiblioteca: null,
    quando: quando.toISOString(),
    redes: redesDoc,
    pendente: redes.some((r) => !manuais.includes(r)),
    origem: 'fabrica',
    criadoEm: new Date().toISOString(),
  });
  return ref.id;
}

// Frases prontas para a legenda do TikTok e do Kwai (sorteia uma a cada post)
const FRASES_CELULAR = [
  '📖 Toda história da Bíblia tem uma lição para hoje. Qual foi a sua? 🙏',
  '✝️ Jesus continua transformando vidas. Siga para mais histórias da Bíblia!',
  '🙏 Se essa história tocou seu coração, compartilhe com alguém que precisa ouvir.',
  '📜 Histórias bíblicas contadas de um jeito que você nunca viu. Siga o perfil!',
  '💛 Deus não esqueceu de você. Comente "Amém" se você crê!',
  '🕊️ Um minuto de Palavra para renovar a sua fé hoje.',
  '📖 A Bíblia está cheia de milagres. Qual é a sua história favorita?',
  '✨ A fé que move montanhas começa com uma história como essa. Siga para a próxima!',
  '🙌 Escreva "Eu creio" nos comentários e marque quem precisa ver isso.',
  '📖 Histórias da Bíblia para toda a família. Salve para assistir de novo!',
  '✝️ O que Deus fez naquele tempo, Ele pode fazer na sua vida hoje. 🙏',
  '🕊️ Jesus te ama e tem um propósito para você. Siga e receba uma história por dia.',
];
const HASHTAGS_CELULAR = ['#fé', '#jesus', '#biblia', '#historiasbiblicas', '#deus', '#gospel'];

/** Legenda do TikTok/Kwai: frase pronta + título + hashtags (as do vídeo e as fixas do canal). */
export function legendaCelular(titulo, legendaBase = '', chamada = '') {
  // Série: a chamada "siga para ver a parte 2" vale mais que a frase pronta
  const frase = chamada || FRASES_CELULAR[Math.floor(Math.random() * FRASES_CELULAR.length)];
  const doVideo = (String(legendaBase).match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 5);
  const tags = [...doVideo, ...HASHTAGS_CELULAR].filter((t, i, a) => a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 8);
  return `${frase}\n\n${String(titulo || '').trim()}\n\n${tags.join(' ')}`.slice(0, 2200);
}
