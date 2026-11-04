// Fábrica de notícias do canal de POLÍTICA (notícias, bastidores e curiosidades da política brasileira).
// Mesmo esquema do canal de games: lê notícias REAIS, a IA escreve o roteiro SÓ com o que está na notícia,
// e cada roteiro fica esperando o dono APROVAR no Compilador antes de virar vídeo.
//
// IMPARCIALIDADE (regra do canal): mostra os dois lados, separa fato de opinião, nunca chama de culpado quem
// ainda não foi condenado ("investigado", "segundo a PF"), nunca inventa fala. Canal de um lado só perde público,
// anunciante e corre risco de processo.
//
// Imagens: SÓ reais. Fotos das agências públicas (Agência Brasil, Agência Senado, Agência Câmara), que são de uso
// livre com crédito, e vídeos reais de banco (Pexels) para cenas gerais (Brasília, Congresso, bandeira, urna).
// NUNCA imagem ou voz de IA imitando político (regra do YouTube e da Justiça Eleitoral).
// De portais (G1, Folha, Poder360 etc.) só usamos o FATO, com crédito e link na descrição: as fotos deles não.

import crypto from 'crypto';
import { ia } from './gamesNoticias';
import { claudeComBusca } from './gamesDicas';

export const COLECAO_POLITICA = 'youvideo_politica_noticias';
const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';

// livre: fotos de uso livre com crédito (podem aparecer no vídeo). urls: tenta na ordem até uma responder.
export const FONTES_POLITICA = [
  { id: 'agbr', nome: 'Agência Brasil', livre: true, urls: ['https://agenciabrasil.ebc.com.br/rss/politica/feed.xml', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', 'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml'] },
  { id: 'senado', nome: 'Agência Senado', livre: true, urls: ['https://www12.senado.leg.br/noticias/rss', 'https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS'] },
  { id: 'camara', nome: 'Agência Câmara', livre: true, urls: ['https://www.camara.leg.br/noticias/rss/ultimas-noticias', 'https://www.camara.leg.br/noticias/rss/dinamico/POLITICA'] },
  // Portais de linhas diferentes (para o canal não ficar de um lado só): só o fato, com crédito e link
  { id: 'g1', nome: 'G1 Política', livre: false, urls: ['https://g1.globo.com/rss/g1/politica/'] },
  { id: 'folha', nome: 'Folha de S.Paulo', livre: false, urls: ['https://feeds.folha.uol.com.br/poder/rss091.xml'] },
  { id: 'poder360', nome: 'Poder360', livre: false, urls: ['https://www.poder360.com.br/feed/'] },
  { id: 'cnn', nome: 'CNN Brasil', livre: false, urls: ['https://www.cnnbrasil.com.br/politica/feed/'] },
  { id: 'estadao', nome: 'Estadão', livre: false, urls: ['https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/'] },
  { id: 'gazeta', nome: 'Gazeta do Povo', livre: false, urls: ['https://www.gazetadopovo.com.br/feed/rss/republica.xml'] },
  { id: 'carta', nome: 'CartaCapital', livre: false, urls: ['https://www.cartacapital.com.br/politica/feed/'] },
];

const CREDITO_FOTOS = '📷 Fotos: Agência Brasil, Agência Senado e Agência Câmara (uso livre com crédito) e Pexels.';
const MUSICA = 'Serious modern TV news background, subtle pulsing synths and soft percussion, tension but neutral, no vocals';
const RODAPE = '⚖️ Este canal mostra os fatos e o que cada lado diz. Opinião aparece sempre identificada como opinião.';

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

/** Fotos de verdade (só das agências públicas): tira ícone, logo, avatar. */
function imagensDe(html) {
  const urls = [];
  const add = (u) => {
    u = entidades(u).trim().split(' ')[0];
    if (!/^https:\/\//i.test(u)) return;
    if (/avatar|gravatar|emoji|icon|logo|badge|pixel|spacer|1x1|brasao|marca|selo/i.test(u)) return;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/\/(uploads|files|fotos|images?)\//i.test(u)) return;
    if (!urls.includes(u)) urls.push(u);
  };
  for (const m of String(html).matchAll(/<(?:media:content|media:thumbnail|enclosure)[^>]+url="([^"]+)"/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<img[^>]+src="([^"]+)"/gi)) add(m[1]);
  for (const m of String(html).matchAll(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi)) add(m[1]);
  return urls.slice(0, 8);
}

async function lerFeed(fonte) {
  let ultimoErro = null;
  for (const url of fonte.urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const xml = await r.text();
      const blocos = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
      if (!blocos.length) throw new Error('feed vazio');
      return blocos.slice(0, 25).map((b) => {
        const link = semTags(tag(b, 'link')) || (b.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
        const conteudo = tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary');
        const data = semTags(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
        const quando = data ? new Date(data) : null;
        return {
          fonte: fonte.id,
          fonteNome: fonte.nome,
          livre: fonte.livre,
          titulo: semTags(tag(b, 'title')).slice(0, 200),
          link: entidades(link).trim(),
          data: quando && !isNaN(quando) ? quando.toISOString() : null,
          texto: semTags(conteudo).slice(0, 5000),
          imagens: fonte.livre ? imagensDe(b) : [],
        };
      }).filter((n) => n.titulo && /^https?:\/\//.test(n.link));
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error('sem resposta');
}

/** Feed só com resumo: abre a página para ler o texto inteiro (e as fotos, se for agência pública). */
async function completarNoticia(n) {
  if (n.texto.length > 1500 && (n.imagens.length >= 1 || !n.livre)) return n;
  try {
    const r = await fetch(n.link, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return n;
    const html = await r.text();
    const corpo = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    const texto = semTags(corpo).slice(0, 6000);
    return {
      ...n,
      texto: texto.length > n.texto.length ? texto : n.texto,
      imagens: n.livre ? [...new Set([...n.imagens, ...imagensDe(corpo), ...imagensDe(html.slice(0, 20000))])].slice(0, 6) : [],
    };
  } catch {
    return n;
  }
}

// ───────────────────────── Regras do texto ─────────────────────────

const REGRAS =
  'REGRAS DO CANAL (obrigatórias): ' +
  '1) Use SÓ fatos que estão no material. Não invente data, número, nome, cargo, placar de votação nem declaração. Nunca crie uma frase entre aspas que a pessoa não disse. ' +
  '2) IMPARCIAL: em todo assunto disputado, diga o que cada lado afirma (governo e oposição, acusação e defesa), com o mesmo espaço e o mesmo tom. ' +
  'Nada de adjetivo que toma partido (golpista, ladrão, herói, genocida, comunista...) a não ser que seja fala de alguém, atribuída a essa pessoa. ' +
  '3) JUSTIÇA: quem não foi condenado é "investigado", "suspeito" ou "acusado de". Use "segundo a Polícia Federal", "de acordo com a denúncia", e diga quando a pessoa nega. ' +
  'Condenação só se o material disser que houve condenação, e diga por qual tribunal. ' +
  '4) Fato é fato; o que é análise vem com "na análise de especialistas" ou "críticos dizem / aliados dizem". O canal não pede voto nem diz em quem votar. ' +
  '5) Português do Brasil, jeito de canal de notícias moderno: frases curtas, claro, sem gíria, sem palavrão. Números e datas por extenso na narração. ' +
  'Nunca copie frases do texto original: reescreva com suas palavras. ' +
  'Cada cena tem "midia", que precisa COMBINAR com a frase da cena. Opções, nesta ordem de preferência: ' +
  '"imagem N" (uma das fotos de agência pública da lista, pelo número: são as imagens reais da notícia, use em quantas cenas fizer sentido); ' +
  '"foto de: <nome completo do político ou autoridade BRASILEIRA citado na frase>" (foto real da pessoa, de uso livre) quando a frase fala de uma pessoa; ' +
  '"foto real: <o assunto da frase em PORTUGUÊS, como estaria no nome de uma foto da Agência Brasil, ex.: plenário da Câmara dos Deputados votação, sessão do Tribunal Superior Eleitoral, ' +
  'Supremo Tribunal Federal sessão plenária, sede da Polícia Federal Brasília, Palácio do Planalto cerimônia, convenção do PT, Senado Federal CPI>" (foto real do assunto); ' +
  'só se nenhuma dessas servir, "vídeo atual: <busca em inglês, concreta e brasileira, ex.: brasilia national congress building, brazilian chamber of deputies plenary, brazil supreme court building, ' +
  'brazilian electronic voting machine, brazilian flag waving, brasilia aerial, brazilian federal police car, brazilian real money bills>". ' +
  'No "vídeo atual" ponha SEMPRE brazil/brazilian/brasilia na busca; nunca busca genérica (people applauding, voting ballot, press conference, office), ' +
  'que traz imagem de outro país ou sem relação. Nunca o nome de um político no "vídeo atual". ' +
  'O público quer VER o que está sendo falado: a maioria das cenas deve ser "imagem N", "foto de:" ou "foto real:"; "vídeo atual" no máximo em 2 cenas.';

function textoDasCenas(cenas, imagens, capitulo = '') {
  const linhas = capitulo ? [`# ${capitulo}`] : [];
  for (const c of cenas || []) {
    const texto = String(c.texto || '').replace(/[぀-ヿ㐀-鿿가-힯]+/g, '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    let midia = String(c.midia || '').trim();
    const num = midia.match(/^imagem\s*(\d+)/i);
    if (num) midia = imagens[Number(num[1]) - 1] ? `imagem: ${imagens[Number(num[1]) - 1]}` : '';
    if (!/^(imagem|v[íi]deo atual|foto de|foto real):/i.test(midia)) midia = 'vídeo atual: brasilia national congress building';
    linhas.push(`@ ${midia}`, texto);
  }
  return linhas.join('\n');
}

const hashtagsDe = (tags) => (tags || []).slice(0, 4).map((t) => '#' + String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');
const capaDe = (imagens) => (imagens?.[0] ? `imagem: ${imagens[0]}` : 'foto: brasilia national congress');

/** Short de ~45 s a partir de UMA notícia. */
export async function roteiroShortPolitica(n) {
  const fotos = n.imagens.map((u, i) => `${i + 1}. ${u}`).join('\n') || '(nenhuma foto livre: use só "vídeo atual:")';
  const j = await ia(
    'Você escreve Shorts de notícias de POLÍTICA para um canal brasileiro imparcial. ' + REGRAS +
      ' Responda só JSON: {"titulo":"até 80 caracteres, desperta CURIOSIDADE sem mentir e sem tomar partido","thumb":"2 a 4 palavras em CAIXA ALTA","cenas":[{"midia":"...","texto":"..."}],"tags":["5 a 10 tags"]}. ' +
      'O Short tem de 75 a 100 palavras (30 a 40 segundos), em 6 a 8 cenas curtas. ' +
      'PRENDER A PESSOA: a 1ª frase (até 12 palavras) é o detalhe mais chocante, curioso ou o número mais forte da notícia — nunca começa com o nome do órgão nem com "atenção, pessoal". ' +
      'Na 2ª frase abra uma curiosidade que só se resolve no fim (ex.: "mas o detalhe mais estranho é outro"). ' +
      'Cada frase traz UMA informação nova e concreta (nome, número, data, frase dita); nada de frase genérica ("isso pode mudar muita coisa"). ' +
      'Diga o que cada lado afirma em uma frase curta cada. Penúltima cena: o detalhe guardado. Última cena: pergunta neutra e curta para os comentários.',
    `Notícia (${n.fonteNome}, ${n.data || 'data não informada'}):\nTítulo: ${n.titulo}\nLink: ${n.link}\n\nTexto:\n${n.texto.slice(0, 4500)}\n\nFotos livres disponíveis:\n${fotos}`
  );
  const tags = (j.tags || []).map(String).slice(0, 12);
  return {
    id: `pol-${idDe(n.link)}`,
    titulo: String(j.titulo || n.titulo).slice(0, 95),
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: '',
    capa: capaDe(n.imagens),
    ritmo: 'documentario',
    cauda: false,
    musica: MUSICA,
    descricao: [
      String(j.titulo || n.titulo),
      `📰 Fonte: ${n.fonteNome} — ${n.link}`,
      RODAPE,
      CREDITO_FOTOS,
      '🔔 Inscreva-se: política explicada sem torcida, todos os dias.',
      `${hashtagsDe(tags)} #politica #shorts`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'política', 'notícias de política', 'brasil'],
    texto: textoDasCenas(j.cenas, n.imagens),
  };
}

/** Vídeo de resumo (~7 a 9 min) juntando as notícias marcadas. */
export async function roteiroVideoPolitica(noticias) {
  const blocos = noticias.map((n, k) => {
    const fotos = n.imagens.map((u, i) => `imagem ${i + 1}: ${u}`).join('\n') || '(sem fotos livres)';
    return `### Notícia ${k + 1} (${n.fonteNome})\nTítulo: ${n.titulo}\nLink: ${n.link}\n${n.texto.slice(0, 3000)}\nFotos livres desta notícia:\n${fotos}`;
  });
  const j = await ia(
    'Você escreve o resumo da semana de um canal brasileiro IMPARCIAL de política. ' + REGRAS +
      ' Em cada bloco, "imagem N" se refere às fotos DAQUELA notícia. ' +
      'Responda só JSON: {"titulo":"até 90 caracteres","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras","abertura":[{"midia":"...","texto":"..."}],' +
      '"blocos":[{"capitulo":"nome curto","noticia":1,"cenas":[{"midia":"...","texto":"..."}]}],"final":[{"midia":"...","texto":"..."}],"tags":["8 a 12 tags"]}. ' +
      'Abertura: 2 ou 3 cenas com gancho e convite para se inscrever. Um bloco por notícia, da mais impactante para a menos, cada um com 4 a 7 cenas: ' +
      'o que aconteceu, os detalhes, o que dizem os dois lados e o que pode acontecer agora. Final: resumo e pergunta neutra. Total de 1100 a 1400 palavras.',
    blocos.join('\n\n')
  );
  const partes = [textoDasCenas(j.abertura, [], 'Abertura')];
  for (const b of j.blocos || []) {
    const n = noticias[(Number(b.noticia) || 1) - 1] || noticias[0];
    partes.push(textoDasCenas(b.cenas, n.imagens, String(b.capitulo || n.titulo).slice(0, 60)));
  }
  partes.push(textoDasCenas(j.final, [], 'Final'));
  const tags = (j.tags || []).map(String).slice(0, 14);
  return {
    id: `pol-video-${idDe(noticias.map((n) => n.link).join('|'))}`,
    titulo: String(j.titulo || 'O que aconteceu na política esta semana').slice(0, 100),
    thumb: String(j.thumb || 'RESUMO DA SEMANA').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').slice(0, 30),
    capa: capaDe(noticias.find((n) => n.imagens[0])?.imagens),
    ritmo: 'documentario',
    cauda: false,
    musica: MUSICA,
    descricao: [
      String(j.titulo || ''),
      'Fontes:\n' + noticias.map((n) => `• ${n.titulo} — ${n.fonteNome}: ${n.link}`).join('\n'),
      RODAPE,
      CREDITO_FOTOS,
      '🔔 Inscreva-se e ative o sininho.\n💬 Qual dessas notícias mais te chamou atenção? Comenta aqui!',
      `${hashtagsDe(tags)} #politica #noticias`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'política', 'resumo da semana', 'brasil'],
    playlist: { titulo: 'Resumo da semana na política', descricao: 'Tudo que aconteceu na política brasileira, explicado sem torcida.' },
    texto: partes.filter(Boolean).join('\n\n'),
  };
}

/**
 * Explicador de curiosidade (ex.: "Como Lula virou no segundo turno", "Por que Bolsonaro foi preso", "O caso Banco Master").
 * O Claude PESQUISA na web antes de escrever (fatos atuais e conferidos) e devolve um vídeo longo ou um Short.
 */
export async function roteiroExplicador(tema, formato = 'longo') {
  const longo = formato !== 'short';
  const { json: j, fontes } = await claudeComBusca(
    'Você escreve vídeos EXPLICADORES de política para um canal brasileiro imparcial (estilo curiosidade: "como aconteceu", "por que", "o que muda"). ' +
      'ANTES de escrever, pesquise na web em várias fontes de linhas diferentes (agências, grandes jornais, sites oficiais do TSE, STF, Câmara, Senado) e use SÓ o que encontrou. ' +
      REGRAS +
      ' Como você não tem fotos da notícia aqui, use "foto de: <nome>" nas cenas sobre uma pessoa, "foto real: <assunto em português>" nas outras e "vídeo atual" só se nada disso servir. ' +
      'No final da sua resposta, coloque SÓ um JSON (sem texto depois) assim: ' +
      '{"titulo":"até 90 caracteres, pergunta ou curiosidade, sem tomar partido","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras",' +
      '"abertura":[{"midia":"foto de: ... | foto real: ... | vídeo atual: ...","texto":"..."}],"blocos":[{"capitulo":"nome curto","cenas":[{"midia":"foto de: ... | foto real: ... | vídeo atual: ...","texto":"..."}]}],' +
      '"final":[{"midia":"vídeo atual: ...","texto":"..."}],"tags":["8 a 12 tags"]}. ' +
      (longo
        ? 'Vídeo longo: abertura com gancho (2 a 3 cenas) e convite para se inscrever; 5 a 7 blocos em ordem (contexto, linha do tempo, o que diz cada lado, números, o que acontece agora); final com resumo e pergunta neutra. Total de 1200 a 1500 palavras.'
        : 'Short: abertura de 1 cena com o gancho, 1 bloco de 4 a 5 cenas, final de 1 cena com pergunta. Total de 100 a 130 palavras.'),
    `Tema do vídeo: ${tema}\nData de hoje: ${new Date().toISOString().slice(0, 10)}`
  );
  const partes = [textoDasCenas(j.abertura, [], longo ? 'Abertura' : '')];
  for (const b of j.blocos || []) partes.push(textoDasCenas(b.cenas, [], longo ? String(b.capitulo || '').slice(0, 60) : ''));
  partes.push(textoDasCenas(j.final, [], longo ? 'Final' : ''));
  const tags = (j.tags || []).map(String).slice(0, 14);
  const slug = String(tema).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ep = {
    id: `pol-exp-${slug}-${Date.now().toString(36)}`,
    titulo: String(j.titulo || tema).slice(0, 100),
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').slice(0, 30),
    capa: 'foto: brasilia national congress',
    ritmo: 'documentario',
    cauda: false,
    musica: MUSICA,
    descricao: [
      String(j.titulo || tema),
      fontes.length ? 'Fontes consultadas:\n' + fontes.slice(0, 8).map((f) => `• ${f.titulo}: ${f.url}`).join('\n') : '',
      RODAPE,
      '📷 Imagens: Pexels.',
      '🔔 Inscreva-se: política explicada sem torcida.',
      `${hashtagsDe(tags)} #politica${longo ? '' : ' #shorts'}`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'política', 'brasil'],
    ...(longo ? { playlist: { titulo: 'Política explicada', descricao: 'Os grandes assuntos da política brasileira, explicados do começo, com os dois lados.' } } : {}),
    texto: partes.filter(Boolean).join('\n\n'),
  };
  return { ep, fontes };
}

/** Busca as notícias novas e deixa as melhores esperando aprovação (com o roteiro do Short já escrito). */
export async function buscarNoticiasPolitica(db, { quantas = 4 } = {}) {
  const col = db.collection(COLECAO_POLITICA);
  const relatorio = [];
  let todas = [];
  await Promise.all(
    FONTES_POLITICA.map(async (f) => {
      try {
        const lista = await lerFeed(f);
        relatorio.push({ id: f.id, nome: f.nome, ok: true, lidas: lista.length });
        todas.push(...lista);
      } catch (e) {
        relatorio.push({ id: f.id, nome: f.nome, ok: false, erro: String(e.message || e).slice(0, 80) });
      }
    })
  );
  const limite = Date.now() - 2 * 86400e3; // política envelhece rápido: só os últimos 2 dias
  todas = todas.filter((n) => !n.data || new Date(n.data).getTime() > limite);
  const vistas = new Set();
  const frescas = [];
  for (const n of todas) {
    const id = idDe(n.link);
    if (vistas.has(id)) continue;
    vistas.add(id);
    if (!(await col.doc(id).get()).exists) frescas.push(n);
  }
  if (!frescas.length) return { novas: 0, fontes: relatorio };

  let escolhidas = frescas.slice(0, quantas);
  if (frescas.length > quantas) {
    try {
      frescas.sort((x, y) => String(y.data || '').localeCompare(String(x.data || '')));
      const lista = frescas.slice(0, 100).map((n, i) => `${i + 1}. [${n.fonteNome}] ${n.titulo}`).join('\n');
      const j = await ia(
        'Você é editor de um canal brasileiro IMPARCIAL de política em SHORTS. Só vale notícia que faz a pessoa PARAR DE ROLAR A TELA. ' +
          'No nosso canal o que mais prende: segredo ou documento revelado (ex.: "Justiça libera documentos médicos da morte de Tancredo"), ' +
          'frase polêmica ou briga pública entre políticos, o lado pessoal e inesperado de um político (religião, família, viagem, gasto), ' +
          'VALORES em reais que chocam (salário, gasto, multa, rombo, fraude), escândalo e investigação com nomes, reviravolta, decisão do STF que muda algo concreto, ' +
          'coisa que mexe no bolso de quem assiste (imposto, aposentadoria, salário mínimo, preço). ' +
          'EVITE (ninguém assiste): tramitação e pauta do Congresso ("governo prioriza propostas", "comissão aprova relatório"), agenda, nota de rotina, homenagem, ' +
          'reunião sem resultado, notícia regional pequena, duas notícias do mesmo assunto. Escolha de lados diferentes (não só notícias boas ou ruins para um lado). ' +
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
      const ep = await roteiroShortPolitica(n);
      await col.doc(idDe(n.link)).set({
        status: 'aguardando',
        tipo: 'short',
        titulo: n.titulo,
        link: n.link,
        fonte: n.fonteNome,
        oficial: !!n.livre,
        data: n.data,
        texto: n.texto.slice(0, 6000),
        imagens: n.imagens,
        ep,
        criadoEm: new Date().toISOString(),
      });
      novas++;
    } catch (e) {
      console.error('roteiro da notícia de política', n.link, e.message);
    }
  }
  return { novas, fontes: relatorio };
}


/**
 * Refaz a escolha das imagens de um roteiro de política OLHANDO A FRASE de cada cena:
 * pessoa citada -> "foto de: Nome Completo" (foto real dela); instituição/fato -> "foto real: <assunto em português>".
 * As fotos da própria notícia ("imagem: https://...") ficam. Assim um roteiro antigo (com "vídeo atual" genérico)
 * passa a mostrar o que está sendo falado. Devolve o ep com o texto novo (ou o mesmo, se a IA falhar).
 */
export async function replanejarMidiasPolitica(ep) {
  const linhas = String(ep?.texto || '').split('\n');
  const cenas = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith('@ ')) continue;
    let texto = '';
    for (let k = i + 1; k < linhas.length && !linhas[k].startsWith('@ ') && !linhas[k].startsWith('# '); k++) texto += ' ' + linhas[k];
    cenas.push({ linha: i, midia: linhas[i].slice(2).split('|')[0].trim(), resto: linhas[i].includes('|') ? linhas[i].slice(linhas[i].indexOf('|')) : '', texto: texto.trim() });
  }
  if (!cenas.length) return ep;
  const novas = await planejarMidiasPorFrase(cenas.map((c) => ({ midia: c.midia, texto: c.texto })), ep.titulo || '');
  if (!novas) return ep;
  let trocou = 0;
  cenas.forEach((c, i) => {
    if (!novas[i]) return;
    linhas[c.linha] = `@ ${novas[i]}${c.resto}`;
    trocou++;
  });
  return trocou ? { ...ep, texto: linhas.join('\n'), midiasReplanejadas: new Date().toISOString() } : ep;
}

/**
 * Para cada cena { midia (atual), texto (a frase) }, escolhe a imagem certa pela frase.
 * Devolve um array com a mídia nova de cada cena ('' = manter) ou null se a IA falhar.
 */
export async function planejarMidiasPorFrase(cenas, titulo = '', noticia = '') {
  let j;
  try {
    j = await ia(
      'Você escolhe a IMAGEM de cada cena de um Short de notícia de política do Brasil. Regra de ouro: a imagem MOSTRA O QUE A FRASE FALA, do jeito mais completo. ' +
        'Use o TEXTO DA NOTÍCIA para saber os nomes e os números que a frase não diz. Tipos de mídia: ' +
        '1) "foto de: <nome completo como no título da Wikipédia>" quando a frase fala de UMA pessoa (ex.: "foto de: Davi Alcolumbre", "foto de: Luiz Inácio Lula da Silva"). ' +
        'Se a frase continua na mesma pessoa (ele, o senador...), mesma pessoa. ' +
        '2) "pessoas: <Nome 1>; <Nome 2>; <Nome 3>" quando a frase fala de um GRUPO (ex.: "seis senadores", "os ministros", "a oposição") e o texto da notícia diz quem são: ' +
        'liste TODOS os nomes que a notícia cita (até 8), cada um aparece num pedaço da cena. ' +
        '3) "documento: <SIGLA número/ano> | <nome curto>" quando a frase fala de um projeto, PEC, PL, PLP, MP, lei, decreto ou relatório ' +
        '(ex.: "documento: PEC 45/2019 | Reforma tributária", "documento: PL 2338/2023 | Regulação da inteligência artificial"). Pegue o número e o ano no texto da notícia; ' +
        'se a notícia não der o número, "documento: | <nome do documento>". ' +
        '4) "documentos: <A>; <B>; <C>" (cada um no formato do item 3, sem o "documento:") quando a frase fala de VÁRIOS documentos (ex.: "quatro propostas"): liste os que a notícia cita. ' +
        '5) "foto real: <TÍTULO EXATO do artigo da Wikipédia em português do lugar ou da instituição>" quando a frase fala de uma empresa, emissora, órgão, prédio ou lugar ' +
        '(ex.: TV Globo -> "foto real: Estúdios Globo"; Senado -> "foto real: Senado Federal do Brasil"; Câmara -> "foto real: Câmara dos Deputados do Brasil"; ' +
        'STF -> "foto real: Supremo Tribunal Federal"; Planalto -> "foto real: Palácio do Planalto"; Polícia Federal -> "foto real: Polícia Federal (Brasil)"; ' +
        'Petrobras -> "foto real: Petrobras"; Banco Central -> "foto real: Banco Central do Brasil"). Se falou da Globo, mostra a Globo; se falou do Senado, mostra o Senado. ' +
        '6) Se a cena tem "imagem: https://..." (foto da própria notícia) e a frase é sobre o fato principal, mantenha igual. ' +
        'Varie: não use a mesma pessoa em todas as cenas se a notícia cita outras pessoas, documentos ou lugares. Nunca invente nome, número ou documento que não está na notícia. ' +
        'Responda só JSON: {"cenas":[{"n":1,"midia":"..."}]}',
      cenas.map((c, i) => `${i + 1}. [atual: ${c.midia}] ${c.texto}`).join('\n') +
        `\n\nTítulo do vídeo: ${titulo}` +
        (noticia ? `\n\nTEXTO DA NOTÍCIA:\n${String(noticia).slice(0, 5000)}` : ''),
      { temperatura: 0.2 }
    );
  } catch {
    return null;
  }
  const porN = new Map((j?.cenas || []).map((c) => [Number(c.n), String(c.midia || '').trim()]));
  return cenas.map((c, i) => {
    const m = porN.get(i + 1) || '';
    if (/^imagem:\s*https:\/\//i.test(c.midia) && !/^(foto de|pessoas|documentos?):/i.test(m)) return ''; // foto da notícia fica
    return /^(foto de|foto real|imagem|pessoas|documento|documentos):/i.test(m) ? m : '';
  });
}

// ───────────────────────── Ilustrações animadas (estilo explicador) ─────────────────────────
// Cada cena pode ganhar uma ilustração desenhada pelo Compilador (carimbo, placar, checklist, calendário...).
// A IA monta os dados SÓ com o que está na notícia; aqui conferimos cada número antes de aceitar.
// A foto da cena continua sendo buscada: é o plano B se a ilustração não puder ser desenhada.

const TIPOS_ILUSTRACAO = ['carimbo', 'placar', 'versus', 'checklist', 'comparacao', 'calendario', 'numero', 'lista', 'linhaTempo', 'pergunta'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const cortar = (t, n) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const numeroDe = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** O número aparece no material (texto da notícia ou frases do vídeo)? Aceita 1.518, 1518, "1,5". */
function numeroNoMaterial(v, material) {
  const n = numeroDe(v);
  if (n == null) return false;
  const limpo = material.replace(/(\d)\.(?=\d{3}\b)/g, '$1');
  const formas = new Set([String(n), String(n).replace('.', ',')]);
  return [...formas].some((f) => new RegExp(`(^|[^\\d])${f.replace('.', '\\.')}([^\\d]|$)`).test(limpo));
}

/** Limpa e confere uma ilustração da IA. Devolve o objeto pronto ou null (descartada). */
export function conferirIlustracao(bruta, material) {
  if (!bruta || typeof bruta !== 'object' || !TIPOS_ILUSTRACAO.includes(bruta.tipo)) return null;
  const temNum = (v) => numeroNoMaterial(v, material);
  const base = {
    tipo: bruta.tipo,
    etiqueta: cortar(bruta.etiqueta, 22),
    titulo: cortar(bruta.titulo, 40),
    destaque: cortar(bruta.destaque, 30),
  };
  if (!base.titulo) return null;
  const lista = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
  switch (bruta.tipo) {
    case 'carimbo': {
      const documento = cortar(bruta.documento, 22);
      if (!documento) return null;
      return { ...base, documento, subtitulo: cortar(bruta.subtitulo, 50), carimbo: cortar(bruta.carimbo || 'APROVADO', 14).toUpperCase(), cor: bruta.cor === 'vermelho' ? 'vermelho' : 'verde' };
    }
    case 'placar': {
      const linhas = lista(bruta.linhas, 3).map((l) => ({ rotulo: cortar(l?.rotulo, 24), valor: numeroDe(l?.valor) })).filter((l) => l.rotulo && l.valor != null && temNum(l.valor));
      if (!linhas.length) return null;
      const total = temNum(bruta.total) ? numeroDe(bruta.total) : null;
      const minimo = temNum(bruta.minimo) ? numeroDe(bruta.minimo) : null;
      return { ...base, linhas, ...(total ? { total } : {}), ...(minimo ? { minimo } : {}), nota: cortar(bruta.nota, 40) };
    }
    case 'versus': {
      const a = { valor: numeroDe(bruta.a?.valor), rotulo: cortar(bruta.a?.rotulo, 16) };
      const b = { valor: numeroDe(bruta.b?.valor), rotulo: cortar(bruta.b?.rotulo, 16) };
      if (a.valor == null || b.valor == null || !temNum(a.valor) || !temNum(b.valor)) return null;
      return { ...base, a, b, nota: cortar(bruta.nota, 44) };
    }
    case 'checklist': {
      const itens = lista(bruta.itens, 4).map((i) => ({ texto: cortar(i?.texto, 36), ...(i?.ok === false ? { ok: false } : {}) })).filter((i) => i.texto);
      return itens.length >= 2 ? { ...base, itens } : null;
    }
    case 'comparacao': {
      const lados = lista(bruta.lados, 2).map((l) => ({ nome: cortar(l?.nome, 30), grande: cortar(l?.grande, 12), texto: cortar(l?.texto, 60) })).filter((l) => l.nome && l.grande);
      // número grande de cada lado tem que estar no material (se for número)
      if (lados.length < 2 || lados.some((l) => /\d/.test(l.grande) && !temNum(l.grande))) return null;
      return { ...base, lados, nota: cortar(bruta.nota, 30) };
    }
    case 'calendario': {
      const dia = Math.round(numeroDe(bruta.dia) || 0);
      const mes = cortar(bruta.mes, 10).toLowerCase();
      if (dia < 1 || dia > 31 || !MESES.includes(mes)) return null;
      // a data precisa estar no material ("3 de novembro", "03/11", "3/11")
      const mm = String(MESES.indexOf(mes) + 1);
      const temData = new RegExp(`(^|[^\\d])0?${dia}(º)?\\s+de\\s+${mes}|(^|[^\\d])0?${dia}/0?${mm}([^\\d]|$)`, 'i').test(material);
      if (!temData) return null;
      const ano = numeroDe(bruta.ano);
      return { ...base, dia, mes: mes.toUpperCase(), ...(ano && temNum(ano) ? { ano } : {}), rotulo: cortar(bruta.rotulo, 14), proximo: cortar(bruta.proximo, 26), proximoTexto: cortar(bruta.proximoTexto, 44), texto: cortar(bruta.texto, 50) };
    }
    case 'numero': {
      if (!temNum(bruta.valor)) return null;
      if (bruta.antes && !temNum(bruta.antes)) return null;
      return { ...base, valor: String(numeroDe(bruta.valor)), prefixo: cortar(bruta.prefixo, 4), sufixo: cortar(bruta.sufixo, 10), texto: cortar(bruta.texto, 60), ...(bruta.antes ? { antes: cortar(bruta.antes, 12) } : {}) };
    }
    case 'lista': {
      const itens = lista(bruta.itens, 4).map((i) => ({ icone: cortar(i?.icone, 4), texto: cortar(i?.texto, 30), selo: cortar(i?.selo, 10) })).filter((i) => i.texto);
      return itens.length >= 2 ? { ...base, itens } : null;
    }
    case 'linhaTempo': {
      const eventos = lista(bruta.eventos, 4).map((e) => ({ data: cortar(e?.data, 20), texto: cortar(e?.texto, 46) })).filter((e) => e.data && e.texto);
      // anos citados nas datas precisam estar no material
      if (eventos.length < 2 || eventos.some((e) => (e.data.match(/\d{4}/g) || []).some((a) => !material.includes(a)))) return null;
      return { ...base, eventos };
    }
    case 'pergunta':
      return { ...base, texto: cortar(bruta.texto || 'E você?', 30) };
    default:
      return null;
  }
}

/**
 * Escolhe as ilustrações das cenas. Devolve um array (uma por cena; null = cena fica com a foto) ou null se a IA falhar.
 */
export async function planejarIlustracoes(cenas, titulo = '', noticia = '') {
  let j;
  try {
    j = await ia(
      'Você é o diretor de arte de um canal brasileiro IMPARCIAL de notícias de política em vídeo curto, no estilo "explicador" com ILUSTRAÇÕES ANIMADAS ' +
        '(como canais de contabilidade que explicam leis: etiqueta pequena, título curto e UM desenho que explica a frase). ' +
        'Para cada cena, decida se ela ganha uma ilustração. Ilustre quando a frase traz um FATO CONCRETO: número, placar de votação, data, prazo, lista do que muda, ' +
        'comparação entre propostas ou lados, documento aprovado/vetado/arquivado, valor em reais. Frase que só fala de uma pessoa fica com a foto (ilustracao: null). ' +
        'Ilustre pelo menos metade das cenas, se o material permitir. A última cena (pergunta para os comentários) usa "pergunta". Não repita o mesmo tipo em cenas seguidas. ' +
        'REGRAS: use SÓ números, datas e nomes que estão no TEXTO DA NOTÍCIA ou nas frases. Nunca invente. Nos dois lados de uma disputa, mesmo tamanho e tom. Sem adjetivo que toma partido. ' +
        'Título: até 4 palavras, curto e direto; "destaque" é UMA palavra (ou duas) do título para ficar dourada. Etiqueta: 1 a 3 palavras em maiúsculas (ex.: "APROVADO", "PLACAR", "O QUE MUDA", "FICOU DE FORA", "E AGORA?", "NO BOLSO"). ' +
        'TIPOS (campos de cada um): ' +
        'carimbo {documento:"PEC 18/2025", subtitulo:"Proposta de emenda à Constituição", carimbo:"APROVADA"|"VETADO"|"ARQUIVADA"|..., cor:"verde"|"vermelho"}; ' +
        'placar {linhas:[{rotulo:"1º turno", valor:73}], total:81, minimo:49, nota:"de 81 senadores"} (barras de votos; total e mínimo só se a notícia disser); ' +
        'versus {a:{valor:38, rotulo:"A favor"}, b:{valor:36, rotulo:"Contra"}, nota:"..."}; ' +
        'checklist {itens:[{texto:"...", ok:true|false}]} (2 a 4 itens curtos; ok:false = ficou de fora/negado); ' +
        'comparacao {lados:[{nome:"Oposição (PL)", grande:"16", texto:"anos, regra geral"},{...}], nota:"..."} (exatamente 2 lados); ' +
        'calendario {dia:3, mes:"novembro", ano:2026, rotulo:"Senado", proximo:"Promulgação", proximoTexto:"..."} (só data que está na notícia); ' +
        'numero {valor:1630, prefixo:"R$ ", sufixo:" mil", antes:"R$ 1.518", texto:"a partir de janeiro"} (antes = valor antigo, opcional); ' +
        'lista {itens:[{icone:"🚆", texto:"Ferrovias", selo:"NOVO"}]} (2 a 4 itens, um emoji simples cada); ' +
        'linhaTempo {eventos:[{data:"abril de 2025", texto:"..."}]} (2 a 4 eventos); ' +
        'pergunta {texto:"E você? 👇"}. ' +
        'Cada ilustração também tem etiqueta, titulo e destaque. Responda só JSON: {"cenas":[{"n":1,"ilustracao":{...}|null}]}',
      cenas.map((c, i) => `${i + 1}. ${c.texto}`).join('\n') + `\n\nTítulo do vídeo: ${titulo}` + (noticia ? `\n\nTEXTO DA NOTÍCIA:\n${String(noticia).slice(0, 6000)}` : ''),
      { temperatura: 0.3 }
    );
  } catch {
    return null;
  }
  const material = [noticia, titulo, ...cenas.map((c) => c.texto)].join('\n');
  const porN = new Map((j?.cenas || []).map((c) => [Number(c.n), c.ilustracao]));
  return cenas.map((_, i) => conferirIlustracao(porN.get(i + 1), material));
}
