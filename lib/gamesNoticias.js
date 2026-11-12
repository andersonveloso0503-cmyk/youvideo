// Fábrica de notícias do canal de games "Próxima Fase".
// Lê notícias REAIS (blogs oficiais de PlayStation, Xbox e Steam + um portal brasileiro para cobrir Nintendo e o resto),
// a IA escreve o roteiro em português SÓ com o que está na notícia (marcando rumor como rumor),
// e cada notícia fica esperando o dono APROVAR no Compilador antes de virar vídeo.
//
// Imagens: só reais. Fotos que vêm na própria notícia dos blogs OFICIAIS (material de divulgação),
// imagens e trailers oficiais do jogo (lib/games.js: IGDB/Steam) e vídeos reais de banco (Pexels) para cenas gerais.
// De portais de notícia NUNCA usamos as imagens (são deles): só o fato, com crédito e link na descrição.

import crypto from 'crypto';

export const COLECAO_NOTICIAS = 'youvideo_games_noticias';
const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';

export const FONTES = [
  { id: 'ps-br', nome: 'PlayStation Blog Brasil', url: 'https://blog.br.playstation.com/feed/', oficial: true },
  { id: 'ps', nome: 'PlayStation Blog', url: 'https://blog.playstation.com/feed/', oficial: true },
  { id: 'xbox-br', nome: 'Xbox Wire Brasil', url: 'https://news.xbox.com/pt-br/feed/', oficial: true },
  { id: 'xbox', nome: 'Xbox Wire', url: 'https://news.xbox.com/en-us/feed/', oficial: true },
  { id: 'steam', nome: 'Steam', url: 'https://store.steampowered.com/feeds/news.xml', oficial: true },
  // Portais (só o fato, com crédito e link; as imagens deles NÃO são usadas): cobrem Nintendo, consoles, preços e lançamentos
  { id: 'voxel', nome: 'Voxel (TecMundo)', url: 'https://www.tecmundo.com.br/voxel/rss', oficial: false },
  { id: 'ign-br', nome: 'IGN Brasil', url: 'https://br.ign.com/feed.xml', oficial: false },
  { id: 'jovemnerd', nome: 'Jovem Nerd', url: 'https://jovemnerd.com.br/feed/', oficial: false },
  { id: 'theenemy', nome: 'The Enemy', url: 'https://www.theenemy.com.br/rss', oficial: false },
  { id: 'nintendolife', nome: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', oficial: false },
  { id: 'gematsu', nome: 'Gematsu', url: 'https://www.gematsu.com/feed', oficial: false },
];

const idDe = (link) => crypto.createHash('sha1').update(String(link)).digest('hex').slice(0, 24);

const entidades = (t) =>
  String(t || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const semTags = (t) => entidades(t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (bloco, nome) => {
  const m = bloco.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i'));
  return m ? m[1] : '';
};

/** Fotos de verdade dentro da notícia (blogs oficiais): tira ícone, avatar, emoji e logo. */
function imagensDe(html) {
  const urls = [];
  const add = (u) => {
    u = entidades(u).trim().split(' ')[0];
    if (!/^https:\/\//i.test(u)) return;
    if (/avatar|gravatar|emoji|icon|logo|badge|pixel|spacer|1x1|feeds\.feedburner/i.test(u)) return;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/\/uploads\//i.test(u)) return;
    if (!urls.includes(u)) urls.push(u);
  };
  for (const m of String(html).matchAll(/<(?:media:content|media:thumbnail|enclosure)[^>]+url="([^"]+)"/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<img[^>]+src="([^"]+)"/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi)) add(m[1]);
  return urls.slice(0, 8);
}

/** Lê um feed RSS/Atom e devolve as notícias. */
async function lerFeed(fonte) {
  const r = await fetch(fonte.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  const blocos = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocos.slice(0, 20).map((b) => {
    const link = semTags(tag(b, 'link')) || (b.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
    const conteudo = tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary');
    const data = semTags(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'));
    return {
      fonte: fonte.id,
      fonteNome: fonte.nome,
      oficial: fonte.oficial,
      titulo: semTags(tag(b, 'title')).slice(0, 200),
      link: entidades(link).trim(),
      data: data ? new Date(data).toISOString() : null,
      texto: semTags(conteudo).slice(0, 5000),
      imagens: fonte.oficial ? imagensDe(b) : [],
    };
  }).filter((n) => n.titulo && /^https?:\/\//.test(n.link));
}

/** Se o feed só trouxe o resumo, abre a página da notícia para ler o texto inteiro (e as fotos, se for oficial). */
async function completarNoticia(n) {
  if (n.texto.length > 1500 && (n.imagens.length >= 2 || !n.oficial)) return n;
  try {
    const r = await fetch(n.link, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return n;
    const html = await r.text();
    const corpo = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    const texto = semTags(corpo).slice(0, 6000);
    return {
      ...n,
      texto: texto.length > n.texto.length ? texto : n.texto,
      imagens: n.oficial ? [...new Set([...n.imagens, ...imagensDe(corpo), ...imagensDe(html.slice(0, 20000))])].slice(0, 8) : [],
    };
  } catch {
    return n;
  }
}

// ───────────────────────── IA (texto) ─────────────────────────
// Usa o mesmo caminho dos outros textos do Youvideo (vai para o Claude se ANTHROPIC_API_KEY existir, senão fal/Groq).

/**
 * IA de texto (Groq). Se a Groq disser "limite por minuto" (429) ou falhar, espera o tempo que ela pede
 * (até 20 s) e tenta de novo; na última tentativa troca de modelo (o outro tem limite separado).
 */
export async function ia(sistema, usuario, { temperatura = 0.6, modelos = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b'] } = {}) {
  let ultimo = null;
  for (let t = 0; t < modelos.length; t++) {
    const modelo = modelos[t];
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY || ''}` },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: modelo,
          temperature: temperatura,
          response_format: { type: 'json_object' },
          ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: usuario },
          ],
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = d?.error?.message || `IA respondeu ${r.status}`;
        const err = new Error(msg);
        err.status = r.status;
        if (/does not exist|decommissioned|not found/i.test(msg) && t < modelos.length - 1) {
          ultimo = err;
          continue; // modelo aposentado: tenta o próximo da lista
        }
        if (r.status === 429 || r.status >= 500) {
          // "Please try again in 12.34s" / cabeçalho retry-after
          const seg = Number(r.headers.get('retry-after')) || Number((msg.match(/try again in ([\d.]+)s/i) || [])[1]) || 6;
          ultimo = err;
          if (t < modelos.length - 1) await new Promise((ok) => setTimeout(ok, Math.min(8, seg + 0.5) * 1000)); // no máximo 8 s: depois troca de modelo
          continue;
        }
        throw err;
      }
      const txt = d?.choices?.[0]?.message?.content || '{}';
      return JSON.parse(String(txt).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
    } catch (e) {
      if (e?.status && e.status !== 429 && e.status < 500) throw e;
      ultimo = e;
      if (t === modelos.length - 1) break;
    }
  }
  throw ultimo || new Error('A IA não respondeu.');
}

const REGRAS =
  'Regras de ouro: use SÓ fatos que estão no texto da notícia. Não invente data, preço, número, nome, plataforma nem declaração. ' +
  'Se a notícia fala de rumor, vazamento ou "pode acontecer", diga claramente que AINDA NÃO É CONFIRMADO. ' +
  'Escreva em português do Brasil, jeito de canal de games jovem e animado, frases curtas, sem gíria forçada, sem palavrão. ' +
  'Números e datas por extenso na narração (ex.: "dezenove de novembro", "duzentos e noventa e nove reais"). ' +
  'Nunca copie frases do texto original: reescreva com suas palavras. ' +
  'Cada cena tem "midia": "imagem N" (uma das fotos oficiais da lista, pelo número), ' +
  '"jogo: <nome oficial do jogo em inglês, como está na Steam>" (fotos e trailers oficiais do jogo) ' +
  'ou "vídeo atual: <busca em inglês de vídeo real de banco, ex.: playstation controller close up, gamer playing at night>". ' +
  '"produto: <nome oficial do aparelho em inglês, ex.: DualSense Edge, PlayStation 5 Pro, Nintendo Switch 2, Xbox Series X, Steam Deck>" (foto real do aparelho) ' +
  'REGRA DO CANAL: a imagem mostra SEMPRE o que está sendo falado. Notícia de JOGO: use "jogo:" em TODAS as cenas (traz a gameplay e os trailers oficiais). ' +
  'Notícia de APARELHO (controle, console, headset, acessório, preço de console): use "produto:" (ou "imagem N" com a foto oficial) em TODAS as cenas; "jogo:" só na frase que fala daquele jogo — nunca mostre a gameplay de um jogo quando a frase fala do aparelho. ' +
  'Notícia de anime, filme ou série que tem jogo (Dragon Ball, Naruto, Pokémon, Star Wars...): use o jogo mais conhecido e recente da franquia, ex.: "jogo: DRAGON BALL: Sparking! ZERO", em todas as cenas. ' +
  'Use "imagem N" para o que só a foto oficial mostra (um console novo, um controle, a arte de um anúncio). ' +
  '"vídeo atual:" só quando o assunto é um aparelho ou algo físico e não há jogo nem foto (ex.: playstation 5 console close up, xbox controller); nunca para ilustrar frase abstrata. ' +
  'Nunca invente nome de jogo.';

const MUSICA_NOTICIA = 'Energetic modern electronic news beat, punchy and upbeat, gaming vibe, no vocals';

/** Monta o texto do episódio (formato dos documentários) a partir das cenas da IA. */
function textoDasCenas(cenas, imagens, capitulo = '') {
  const linhas = capitulo ? [`# ${capitulo}`] : [];
  for (const c of cenas || []) {
    const texto = String(c.texto || '').replace(/\bjogo:\s*/gi, '').replace(/[぀-ヿ㐀-鿿가-힯]+/g, '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    let midia = String(c.midia || '').trim();
    const num = midia.match(/^imagem\s*(\d+)/i);
    if (num) midia = imagens[Number(num[1]) - 1] ? `imagem: ${imagens[Number(num[1]) - 1]}` : '';
    if (!/^(imagem|jogo|v[íi]deo atual):/i.test(midia)) midia = 'vídeo atual: gamer playing video game at night';
    linhas.push(`@ ${midia}`, texto);
  }
  return linhas.join('\n');
}

const hashtagsDe = (tags) => (tags || []).slice(0, 4).map((t) => '#' + String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');

const palavrasDe = (cenas) => (cenas || []).reduce((t, c) => t + String(c?.texto || '').split(/\s+/).filter(Boolean).length, 0);

/** Short de 25-35 s (curto) ou 45-55 s (médio, notícia grande) a partir de UMA notícia. Devolve o episódio pronto para a Fábrica. */
export async function roteiroShort(n) {
  const fotos = n.imagens.map((u, i) => `${i + 1}. ${u}`).join('\n') || '(nenhuma foto oficial: use "jogo:" ou "vídeo atual:")';
  const { aberturasQueSeguram } = await import('./retencao');
  const { ajustesDoCanal } = await import('./melhorias');
  const aprendido = (await aberturasQueSeguram('games').catch(() => '')) + (await ajustesDoCanal('games').catch(() => ''));
  const j = await ia(
    'Você escreve Shorts de notícias de games para o canal brasileiro "Próxima Fase". ' + REGRAS + aprendido +
      ' Responda só JSON: {"titulo":"até 80 caracteres, que desperta CURIOSIDADE sem mentir — nunca diga como fato o que não aconteceu (console em forma de jacaré não é \"jacaré engoliu um Xbox\"); se é sorteio, promoção ou edição especial, deixe claro (ex.: "A Sony fez o que ninguém esperava com o PS5", "Esse detalhe do GTA 6 mudou tudo")","thumb":"2 a 4 palavras em CAIXA ALTA que dão vontade de saber mais","cenas":[{"midia":"...","texto":"..."}],"tags":["5 a 10 tags"],"confirmado":true|false,"potencial":1-10,"tamanho":"curto"|"medio"}. ' +
      'TAMANHO PELO ASSUNTO (a retenção é o que mais pesa no canal): escolha "curto" para a maioria — UM fato simples (um anúncio, um rumor, uma data, um número): de 60 a 80 palavras no total (uns 25 a 35 segundos), em 4 ou 5 cenas. ' +
      'Escolha "medio" SÓ quando a notícia é GRANDE ou tem várias partes que o gamer precisa entender (lançamento com data + preço + plataformas, revelação grande de GTA/Nintendo/PlayStation, mudança que afeta quem joga, polêmica com dois lados): de 110 a 135 palavras (uns 45 a 55 segundos), em 6 a 8 cenas. Na dúvida, "curto". ' +
      'Nos dois: UMA notícia, nada de contexto longo, histórico do jogo, repetição ou frase de enchimento; cada frase traz uma informação nova. CURIOSIDADE é o que segura: 7 em cada 10 pessoas pulam o Short no 1º segundo, então ' +
      'a 1ª frase tem NO MÁXIMO 10 palavras, já diz o nome do jogo e o fato mais surpreendente ou estranho da notícia, começando direto no assunto ' +
      '(nada de "olá", "atenção, gamers", "hoje vamos falar", "saiu a notícia"). Ex.: "Só UM jogador no mundo controla esse personagem por vez." / "O GTA 6 não vai rodar no PS4." ' +
      'Jeitos de abrir que mais seguram: CONTRADIÇÃO ("O jogo mais esperado do ano quase foi proibido."), PERGUNTA que a pessoa quer ver respondida ("Por que o GTA 6 vai custar mais caro no Brasil?"), NÚMERO estranho ("Um carro do GTA 6 custa US$ 1,3 milhão. De verdade."), SEGREDO revelado ("Acharam um arquivo escondido no GTA 6."). ' +
      'CURIOSIDADE ABERTA: a 2ª frase deixa uma pergunta no ar que só é respondida na PENÚLTIMA cena (ex.: "E o motivo é ainda mais estranho." / "Mas tem um detalhe que quase ninguém viu."), e a penúltima cena responde de verdade. ' +
      'A 1ª cena usa "jogo:" (a imagem mais forte do jogo) sempre que houver um jogo. A resposta completa só vem no meio do vídeo. Nunca exagere nem invente para gerar curiosidade. ' +
      '"potencial": de 1 a 10, quanto essa notícia faz um gamer brasileiro PARAR de rolar o feed: curiosidade, fato estranho, polêmica, número chocante, ' +
      'franquia gigante (GTA, Pokémon, Dragon Ball, Zelda, Minecraft, Roblox, CoD) = alto; lista de lançamentos, promoção, patch notes, jogo desconhecido = baixo. Seja exigente. ' +
      'Depois, em 1 ou 2 frases curtas, o que foi confirmado e por que importa para quem joga. Última cena: pergunta curta + uma PALAVRA-CHAVE para comentar, no formato "Comenta JOGARIA ou PASSO" (ou "Comenta SIM ou NÃO", "Comenta HYPE"), em até 12 palavras. Inclua no JSON "comenta":"JOGARIA ou PASSO" (as palavras-chave usadas).',
    `Notícia (${n.fonteNome}${n.oficial ? ', fonte oficial' : ''}, ${n.data || 'data não informada'}):\nTítulo: ${n.titulo}\nLink: ${n.link}\n\nTexto:\n${n.texto.slice(0, 4500)}\n\nFotos oficiais disponíveis:\n${fotos}`
  );
  // Ortografia: a legenda é o próprio texto narrado, então o texto já sai revisado
  if (Array.isArray(j.cenas) && j.cenas.length) {
    try {
      const { revisarOrtografia } = await import('./politicaNoticias');
      const rev = await revisarOrtografia([j.titulo || '', j.thumb || '', ...j.cenas.map((c) => c?.texto || '')]);
      if (j.titulo) j.titulo = rev[0];
      if (j.thumb) j.thumb = rev[1];
      j.cenas.forEach((c, i) => c && c.texto && (c.texto = rev[2 + i]));
    } catch {}
  }
  const tags = (j.tags || []).map(String).slice(0, 12);
  return {
    id: `noticia-${idDe(n.link)}`,
    titulo: String(j.titulo || n.titulo).slice(0, 95),
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: j.confirmado === false ? 'Rumor' : '',
    potencial: Math.max(1, Math.min(10, Number(j.potencial) || 5)), // a aprovação automática escolhe primeiro as que mais param o feed
    // curto (25-35 s, um fato) ou medio (45-55 s, notícia grande): o Painel compara a retenção dos dois
    tamanho: j.tamanho === 'medio' || palavrasDe(j.cenas) > 100 ? 'medio' : 'curto',
    capa: (n.imagens[0] && `imagem: ${n.imagens[0]}`) || '',
    ritmo: 'games',
    cauda: false,
    musica: MUSICA_NOTICIA,
    descricao: [
      `${String(j.titulo || n.titulo)}`,
      `💬 Comenta ${String(j.comenta || 'JOGARIA ou PASSO').toUpperCase().slice(0, 30)}!`,
      `📰 Fonte: ${n.fonteNome} — ${n.link}`,
      j.confirmado === false ? '⚠️ Atenção: parte desta notícia ainda não foi confirmada oficialmente.' : '',
      '🔔 Inscreva-se no Próxima Fase: novidades do mundo dos games todos os dias.',
      `${hashtagsDe(tags)} #games #shorts`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'notícias de games', 'próxima fase'],
    texto: textoDasCenas(j.cenas, n.imagens),
  };
}

/** Vídeo de notícias (~7 a 9 min) juntando várias notícias aprovadas pelo dono. */
export async function roteiroVideo(noticias) {
  const blocos = noticias.map((n, k) => {
    const fotos = n.imagens.map((u, i) => `imagem ${i + 1}: ${u}`).join('\n') || '(sem fotos oficiais)';
    return `### Notícia ${k + 1} (${n.fonteNome}${n.oficial ? ', oficial' : ''})\nTítulo: ${n.titulo}\nLink: ${n.link}\n${n.texto.slice(0, 3000)}\nFotos oficiais desta notícia:\n${fotos}`;
  });
  const j = await ia(
    'Você escreve o vídeo de notícias da semana do canal brasileiro de games "Próxima Fase". ' + REGRAS +
      ' Em cada bloco, "imagem N" se refere às fotos DAQUELA notícia. ' +
      'Responda só JSON: {"titulo":"até 90 caracteres","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras","abertura":[{"midia":"...","texto":"..."}],' +
      '"blocos":[{"capitulo":"nome curto","noticia":1,"cenas":[{"midia":"...","texto":"..."}]}],"final":[{"midia":"...","texto":"..."}],"tags":["8 a 12 tags"]}. ' +
      'Abertura: 2 ou 3 cenas que criam CURIOSIDADE (adiantam a notícia mais surpreendente sem entregar tudo) e um convite para se inscrever. ' +
      'Título e thumb despertam curiosidade sem mentir. Um bloco por notícia, na ordem mais impactante primeiro, cada um começando com um gancho, ' +
      'cada bloco com 4 a 7 cenas: o que aconteceu, os detalhes confirmados, e a OPINIÃO do canal (deixe claro que é opinião). ' +
      'Final: resumo rápido e pergunta para os comentários. Total de 1100 a 1400 palavras.',
    blocos.join('\n\n')
  );
  const partes = [];
  partes.push(textoDasCenas(j.abertura, [], 'Abertura'));
  for (const b of j.blocos || []) {
    const n = noticias[(Number(b.noticia) || 1) - 1] || noticias[0];
    partes.push(textoDasCenas(b.cenas, n.imagens, String(b.capitulo || n.titulo).slice(0, 60)));
  }
  partes.push(textoDasCenas(j.final, [], 'Final'));
  const tags = (j.tags || []).map(String).slice(0, 14);
  const capa = noticias.find((n) => n.imagens[0])?.imagens[0];
  return {
    id: `noticias-${idDe(noticias.map((n) => n.link).join('|'))}`,
    titulo: String(j.titulo || 'As notícias da semana no mundo dos games').slice(0, 100),
    thumb: String(j.thumb || 'NOTÍCIAS DA SEMANA').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').slice(0, 30),
    capa: capa ? `imagem: ${capa}` : '',
    ritmo: 'games',
    cauda: false,
    musica: MUSICA_NOTICIA,
    descricao: [
      String(j.titulo || ''),
      'Fontes:\n' + noticias.map((n) => `• ${n.titulo} — ${n.fonteNome}: ${n.link}`).join('\n'),
      '🔔 Inscreva-se no Próxima Fase e ative o sininho: novidades do mundo dos games todos os dias.\n💬 Qual dessas notícias foi a melhor para você? Comenta aqui!',
      `${hashtagsDe(tags)} #games #noticiasgames`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'notícias de games', 'próxima fase'],
    playlist: { titulo: 'Notícias de games', descricao: 'Tudo que aconteceu no mundo dos games, toda semana. Inscreva-se no Próxima Fase!' },
    texto: partes.filter(Boolean).join('\n\n'),
  };
}

/**
 * Busca as notícias novas e deixa as melhores esperando aprovação (com o roteiro do Short já escrito).
 * quantas = quantos Shorts no máximo por busca. Devolve { novas, fontes: [{ id, nome, ok, erro, lidas }] }.
 */
export async function buscarNoticias(db, { quantas = 4 } = {}) {
  const col = db.collection(COLECAO_NOTICIAS);
  const relatorio = [];
  let todas = [];
  await Promise.all(
    FONTES.map(async (f) => {
      try {
        const lista = await lerFeed(f);
        relatorio.push({ id: f.id, nome: f.nome, ok: true, lidas: lista.length });
        todas.push(...lista);
      } catch (e) {
        relatorio.push({ id: f.id, nome: f.nome, ok: false, erro: String(e.message || e).slice(0, 80) });
      }
    })
  );
  // Só as das últimas 48 h que ainda não vimos (o canal vive de novidade)
  const limite = Date.now() - 2 * 86400e3;
  todas = todas.filter((n) => !n.data || new Date(n.data).getTime() > limite);
  // Fora do assunto (post patrocinado de hospedagem, cupom de loja, tecnologia que não é jogo): não vira vídeo de games
  const FORA = /\b(hostinger|wordpress|hospedagem|dom[íi]nio|vpn|cupom|cashback|empr[ée]stimo|cart[ãa]o de cr[ée]dito|seguro|criptomoeda|bitcoin|apostas?|bet\b|cassino|patrocinado|publieditorial|black friday de (celular|tv|notebook))/i;
  todas = todas.filter((n) => !FORA.test(`${n.titulo || ''} ${String(n.resumo || n.texto || '').slice(0, 300)}`));
  const vistas = new Set();
  const frescas = [];
  for (const n of todas) {
    const id = idDe(n.link);
    if (vistas.has(id)) continue;
    vistas.add(id);
    const ja = await col.doc(id).get();
    if (!ja.exists) frescas.push(n);
  }
  if (!frescas.length) return { novas: 0, fontes: relatorio };

  // A IA escolhe as mais importantes para o público brasileiro (sem repetir assunto)
  let escolhidas = frescas.slice(0, quantas);
  if (frescas.length > quantas) {
    try {
      frescas.sort((x, y) => String(y.data || '').localeCompare(String(x.data || ''))); // mais novas primeiro
      const lista = frescas.slice(0, 80).map((n, i) => `${i + 1}. [${n.fonteNome}] ${n.titulo}`).join('\n');
      const j = await ia(
        'Você é editor de um canal brasileiro de notícias de games. Escolha as notícias com MAIS interesse para jogadores brasileiros: ' +
          'grandes lançamentos e datas de lançamento, consoles e videogames novos (PlayStation, Xbox, Nintendo Switch, PC, portáteis), preços, jogos grátis, adiamentos, polêmicas, trailers e anúncios. ' +
          'PRIORIDADE MÁXIMA: notícias que despertam CURIOSIDADE e vontade de comentar: revelações, segredos, vazamentos confirmados, ' +
          'surpresas, recordes, polêmicas, mudanças inesperadas, "o que ninguém esperava", algo que afeta quem joga. ' +
          'Evite notícia morna: promoção pequena, post institucional, patch técnico, evento sem jogo e duas notícias sobre o mesmo assunto. ' +
          'A lista está da mais NOVA para a mais antiga: notícia que acabou de sair vale mais. ' +
          'ANIME só quando é JOGO: jogo de anime (Dragon Ball, Naruto, Demon Slayer, Jujutsu Kaisen, One Piece, Pokémon, My Hero Academia, Bleach...) ou anime/série baseado em jogo (Cyberpunk Edgerunners, Castlevania, Devil May Cry, Arcane) — esses têm prioridade, o público gamer adora. ' +
          'Notícia SÓ de anime (episódio, temporada, mangá) NÃO entra. ' +
          `Responda só JSON: {"escolhidas":[números, no máximo ${quantas}]}`,
        lista,
        { temperatura: 0.2 }
      );
      const nums = (j.escolhidas || []).map(Number).filter((x) => x >= 1 && x <= frescas.length);
      if (nums.length) escolhidas = [...new Set(nums)].slice(0, quantas).map((x) => frescas[x - 1]);
    } catch {
      /* fica com as primeiras */
    }
  }
  // As outras ficam registradas como "vistas" (não voltam na próxima busca), sem roteiro
  const escolhidasIds = new Set(escolhidas.map((n) => idDe(n.link)));
  const batch = db.batch();
  for (const n of frescas) {
    if (escolhidasIds.has(idDe(n.link))) continue;
    batch.set(col.doc(idDe(n.link)), { status: 'ignorada', titulo: n.titulo, link: n.link, fonte: n.fonteNome, criadoEm: new Date().toISOString() });
  }
  await batch.commit();

  let novas = 0;
  for (const bruta of escolhidas) {
    const n = await completarNoticia(bruta);
    try {
      const ep = await roteiroShort(n);
      await col.doc(idDe(n.link)).set({
        status: 'aguardando',
        tipo: 'short',
        titulo: n.titulo,
        link: n.link,
        fonte: n.fonteNome,
        oficial: n.oficial,
        data: n.data,
        texto: n.texto.slice(0, 6000),
        imagens: n.imagens,
        ep,
        criadoEm: new Date().toISOString(),
      });
      novas++;
    } catch (e) {
      // Tenta de novo na próxima busca
      console.error('roteiro da notícia', n.link, e.message);
    }
  }
  return { novas, fontes: relatorio };
}
