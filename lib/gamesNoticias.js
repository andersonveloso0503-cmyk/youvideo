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
  // Portal brasileiro: cobre Nintendo, consoles, preços e o que os blogs oficiais não falam (só o fato, sem as imagens dele)
  { id: 'voxel', nome: 'Voxel (TecMundo)', url: 'https://www.tecmundo.com.br/voxel/rss', oficial: false },
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

async function ia(sistema, usuario, { temperatura = 0.6 } = {}) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY || ''}` },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: temperatura,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `IA respondeu ${r.status}`);
  const txt = d?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(String(txt).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
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
  'Regra do canal: VÍDEO dá credibilidade. Sempre que a notícia citar um jogo, use "jogo:" (traz a gameplay e os trailers oficiais) na maioria das cenas. ' +
  'Use "imagem N" só para mostrar o que só a foto oficial mostra (um console novo, um controle, a arte de um anúncio), no máximo 2 cenas. ' +
  'Para o resto, "vídeo atual:" com uma busca bem concreta do assunto (ex.: playstation 5 console close up, xbox controller, gaming pc setup rgb). ' +
  'Nunca invente nome de jogo.';

const MUSICA_NOTICIA = 'Energetic modern electronic news beat, punchy and upbeat, gaming vibe, no vocals';

/** Monta o texto do episódio (formato dos documentários) a partir das cenas da IA. */
function textoDasCenas(cenas, imagens, capitulo = '') {
  const linhas = capitulo ? [`# ${capitulo}`] : [];
  for (const c of cenas || []) {
    const texto = String(c.texto || '').replace(/\s+/g, ' ').trim();
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

/** Short de ~40 s a partir de UMA notícia. Devolve o episódio pronto para a Fábrica. */
export async function roteiroShort(n) {
  const fotos = n.imagens.map((u, i) => `${i + 1}. ${u}`).join('\n') || '(nenhuma foto oficial: use "jogo:" ou "vídeo atual:")';
  const j = await ia(
    'Você escreve Shorts de notícias de games para o canal brasileiro "Próxima Fase". ' + REGRAS +
      ' Responda só JSON: {"titulo":"até 80 caracteres, direto, sem mentir","thumb":"2 a 4 palavras em CAIXA ALTA","cenas":[{"midia":"...","texto":"..."}],"tags":["5 a 10 tags"],"confirmado":true|false}. ' +
      'O Short tem de 90 a 120 palavras no total, em 5 a 7 cenas. A 1ª frase JÁ É a notícia (nada de "atenção, gamers"). ' +
      'Depois explique o que foi confirmado e por que isso importa para quem joga. Última cena: uma pergunta para o público comentar.',
    `Notícia (${n.fonteNome}${n.oficial ? ', fonte oficial' : ''}, ${n.data || 'data não informada'}):\nTítulo: ${n.titulo}\nLink: ${n.link}\n\nTexto:\n${n.texto.slice(0, 4500)}\n\nFotos oficiais disponíveis:\n${fotos}`
  );
  const tags = (j.tags || []).map(String).slice(0, 12);
  return {
    id: `noticia-${idDe(n.link)}`,
    titulo: String(j.titulo || n.titulo).slice(0, 95),
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: j.confirmado === false ? 'Rumor' : '',
    capa: (n.imagens[0] && `imagem: ${n.imagens[0]}`) || '',
    ritmo: 'games',
    cauda: false,
    musica: MUSICA_NOTICIA,
    descricao: [
      `${String(j.titulo || n.titulo)}`,
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
      'Abertura: 2 ou 3 cenas com as manchetes e um convite para se inscrever. Um bloco por notícia, na ordem mais impactante primeiro, ' +
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
  // Só as dos últimos 3 dias que ainda não vimos
  const limite = Date.now() - 3 * 86400e3;
  todas = todas.filter((n) => !n.data || new Date(n.data).getTime() > limite);
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
      const lista = frescas.slice(0, 40).map((n, i) => `${i + 1}. [${n.fonteNome}] ${n.titulo}`).join('\n');
      const j = await ia(
        'Você é editor de um canal brasileiro de notícias de games. Escolha as notícias com MAIS interesse para jogadores brasileiros: ' +
          'grandes lançamentos, consoles (PlayStation, Xbox, Nintendo, PC), preços, jogos grátis, adiamentos, polêmicas, trailers e anúncios. ' +
          'Evite promoção pequena, post institucional, evento sem jogo e duas notícias sobre o mesmo assunto. ' +
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
