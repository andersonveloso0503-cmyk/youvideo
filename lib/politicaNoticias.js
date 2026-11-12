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
import { lugarDaNoticia } from './lugares';

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
  // O que mexe no BOLSO (imposto, salário, aposentadoria, preço, benefício)
  { id: 'agbr-eco', nome: 'Agência Brasil', livre: true, urls: ['https://agenciabrasil.ebc.com.br/rss/economia/feed.xml'] },
  { id: 'g1-eco', nome: 'G1 Economia', livre: false, urls: ['https://g1.globo.com/rss/g1/economia/'] },
  { id: 'folha-eco', nome: 'Folha de S.Paulo', livre: false, urls: ['https://feeds.folha.uol.com.br/mercado/rss091.xml'] },
  // Mundo: Trump/EUA e o que lá fora afeta o Brasil (o editor só escolhe desses)
  { id: 'g1-mundo', nome: 'G1 Mundo', livre: false, urls: ['https://g1.globo.com/rss/g1/mundo/'] },
  { id: 'cnn-mundo', nome: 'CNN Brasil', livre: false, urls: ['https://www.cnnbrasil.com.br/internacional/feed/'] },
  { id: 'folha-mundo', nome: 'Folha de S.Paulo', livre: false, urls: ['https://feeds.folha.uol.com.br/mundo/rss091.xml'] },
];

// O que está EM ALTA agora (Google Notícias, Brasil): só os títulos, para o editor dar prioridade ao assunto do momento
const EM_ALTA_URLS = [
  'https://news.google.com/rss/headlines/section/topic/NATION?hl=pt-BR&gl=BR&ceid=BR:pt-419',
  'https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419',
];
async function assuntosEmAlta() {
  const titulos = [];
  for (const url of EM_ALTA_URLS) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const xml = await r.text();
      for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
        const t = semTags(tag(m[0], 'title')).replace(/\s+-\s+[^-]+$/, '').trim(); // tira " - Nome do jornal"
        if (t && !titulos.includes(t)) titulos.push(t);
      }
    } catch {}
  }
  return titulos.slice(0, 40);
}

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
  '"foto de: <nome completo do político ou autoridade citado na frase (brasileiro ou estrangeiro, ex.: Donald Trump)>" (foto real da pessoa, de uso livre) quando a frase fala de uma pessoa; ' +
  '"foto real: <o assunto da frase em PORTUGUÊS, como estaria no nome de uma foto da Agência Brasil, ex.: plenário da Câmara dos Deputados votação, sessão do Tribunal Superior Eleitoral, ' +
  'Supremo Tribunal Federal sessão plenária, sede da Polícia Federal Brasília, Palácio do Planalto cerimônia, convenção do PT, Senado Federal CPI>" (foto real do assunto); ' +
  'só se nenhuma dessas servir, "vídeo atual: <busca em inglês, concreta e brasileira, ex.: brasilia national congress building, brazilian chamber of deputies plenary, brazil supreme court building, ' +
  'brazilian electronic voting machine, brazilian flag waving, brasilia aerial, brazilian federal police car, brazilian real money bills>". ' +
  'No "vídeo atual" ponha SEMPRE o PAÍS da notícia na busca (brazil/brazilian/brasilia para o Brasil; para outro país, o nome dele: "asuncion paraguay city", "buenos aires protest", "washington dc capitol"); ' +
  'notícia de outro país NUNCA usa imagem de Brasília; nunca busca genérica (people applauding, voting ballot, press conference, office), ' +
  'que traz imagem de outro país ou sem relação. Nunca o nome de um político no "vídeo atual". ' +
  'O público quer VER o que está sendo falado: a maioria das cenas deve ser "imagem N", "foto de:" ou "foto real:"; "vídeo atual" no máximo em 2 cenas.';

/**
 * Revisor de ORTOGRAFIA: corrige acento, grafia e concordância de textos curtos sem reescrever.
 * Só aceita a correção quando os números e o tamanho continuam iguais (senão fica o original).
 */
export async function revisarOrtografia(textos) {
  const lista = (textos || []).map((t) => String(t ?? ''));
  const idx = lista.map((t, i) => (/[A-Za-zÀ-ÿ]{3}/.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return lista;
  try {
    const j = await ia(
      'Você é revisor de português do Brasil. Corrija SÓ ortografia, acentuação, crase, pontuação e concordância de cada texto. ' +
        'NÃO reescreva, NÃO troque palavras, NÃO mude nomes próprios (pessoas, partidos, jogos, empresas; nomes estrangeiros ficam na grafia original), NÃO mude números, siglas nem maiúsculas/minúsculas. ' +
        'Se o texto já está certo, devolva igual. Responda só JSON: {"textos":["..."]} na mesma ordem e com a mesma quantidade.',
      JSON.stringify({ textos: idx.map((i) => lista[i]) }),
      { temperatura: 0 }
    );
    const novos = Array.isArray(j?.textos) ? j.textos : [];
    if (novos.length !== idx.length) return lista;
    const digitos = (t) => (String(t).match(/\d+/g) || []).join('|');
    let trocas = 0;
    idx.forEach((i, k) => {
      const n = String(novos[k] ?? '').trim();
      const o = lista[i];
      if (!n || n === o.trim()) return;
      if (digitos(n) !== digitos(o)) return;
      if (n.length < o.length * 0.85 || n.length > o.length * 1.15 + 3) return;
      if (o === o.toUpperCase() && n !== n.toUpperCase()) return; // caixa alta continua caixa alta
      lista[i] = n;
      trocas += 1;
    });
    if (trocas) console.log(`[ortografia] ${trocas} texto(s) corrigido(s)`);
  } catch {}
  return lista;
}

/** Corrige a ortografia de todos os textos que aparecem escritos numa lista de ilustrações (no lugar). */
const CHAVES_SEM_TEXTO = new Set(['tipo', 'clima', 'cor', 'quem', 'casa', 'uf', 'pais', 'icone', 'lugar', 'prefixo', 'sufixo', 'valor', 'nome', 'fonte', 'mes']);
async function revisarIlustracoes(ilus) {
  const refs = [];
  const andar = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && !CHAVES_SEM_TEXTO.has(k)) refs.push([o, k]);
      else if (v && typeof v === 'object') andar(v);
    }
  };
  (ilus || []).forEach(andar);
  if (!refs.length) return ilus;
  const novos = await revisarOrtografia(refs.map(([o, k]) => o[k]));
  refs.forEach(([o, k], i) => (o[k] = novos[i]));
  return ilus;
}

/**
 * Fecho do vídeo de política: o "se inscreve" é SEMPRE a última fala (é quando o bonequinho aperta o botão na tela).
 * Corta qualquer frase ou cena que vinha depois do pedido de inscrição; se o roteiro não pediu, acrescenta no fim.
 */
const PEDE_INSCRICAO = /inscrev|inscri[cç][aã]o no canal|ativa o sininho/i;
export function inscricaoNoFim(texto) {
  const linhas = String(texto || '').split('\n');
  // Cena = linha "@ ..." + as linhas de fala até a próxima "@" ou "#"
  const falas = [];
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].startsWith('@ ') || linhas[i].startsWith('# ') || !linhas[i].trim()) continue;
    falas.push(i);
  }
  if (!falas.length) return texto;
  // Última fala que pede inscrição (só conta se estiver na reta final: últimas 3 falas)
  let alvo = -1;
  for (let k = falas.length - 1; k >= Math.max(0, falas.length - 3); k--) if (PEDE_INSCRICAO.test(linhas[falas[k]])) { alvo = k; break; }
  if (alvo < 0) {
    const ult = falas[falas.length - 1];
    linhas[ult] = `${linhas[ult].trim().replace(/[^.!?…]$/, '$&.')} Se inscreve no canal pra não perder a próxima.`;
    return linhas.join('\n');
  }
  const i = falas[alvo];
  // Dentro da fala: termina na frase que pede a inscrição
  const frases = linhas[i].match(/[^.!?…]+[.!?…]*\s*/g) || [linhas[i]];
  let ate = frases.length - 1;
  for (let f = frases.length - 1; f >= 0; f--) if (PEDE_INSCRICAO.test(frases[f])) { ate = f; break; }
  linhas[i] = frases.slice(0, ate + 1).join('').trim();
  // Tudo depois dessa fala (outras cenas de encerramento) sai do roteiro
  let fim = i + 1;
  return linhas.slice(0, fim).join('\n').replace(/\n(@ [^\n]*|# [^\n]*|\s*)$/g, '');
}

function textoDasCenas(cenas, imagens, capitulo = '') {
  const linhas = capitulo ? [`# ${capitulo}`] : [];
  for (const c of cenas || []) {
    const texto = String(c.texto || '').replace(/[぀-ヿ㐀-鿿가-힯]+/g, '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    let midia = String(c.midia || '').trim();
    const num = midia.match(/^imagem\s*(\d+)/i);
    if (num) midia = imagens[Number(num[1]) - 1] ? `imagem: ${imagens[Number(num[1]) - 1]}` : '';
    if (!/^(imagem|v[íi]deo atual|foto de|foto real):/i.test(midia)) {
      const lugar = lugarDaNoticia(c.texto); // notícia de outro país: imagem daquele país, não Brasília
      midia = `vídeo atual: ${lugar ? lugar.buscas[0] : 'brasilia national congress building'}`;
    }
    linhas.push(`@ ${midia}`, texto);
  }
  return linhas.join('\n');
}

const hashtagsDe = (tags) => (tags || []).slice(0, 4).map((t) => '#' + String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');
const capaDe = (imagens) => (imagens?.[0] ? `imagem: ${imagens[0]}` : 'foto: brasilia national congress');

/** Short de ~45 s a partir de UMA notícia. */
export async function roteiroShortPolitica(n) {
  const fotos = n.imagens.map((u, i) => `${i + 1}. ${u}`).join('\n') || '(nenhuma foto livre: use só "vídeo atual:")';
  const { aberturasQueSeguram } = await import('./retencao');
  const { ajustesDoCanal } = await import('./melhorias');
  const aprendido = (await aberturasQueSeguram('politica').catch(() => '')) + (await ajustesDoCanal('politica').catch(() => ''));
  const sistema =
    'Você escreve Shorts de notícias de POLÍTICA para um canal brasileiro imparcial. ' + REGRAS + aprendido +
      ' Responda só JSON: {"titulo":"até 70 caracteres: começa pelo NOME (pessoa, órgão ou assunto) e diz o fato mais forte ou o efeito no bolso, deixando uma curiosidade; sem mentir, sem tomar partido, sem clickbait vazio. Bons: \"Lula sanciona isenção do IR: quem ganha até R$ 5 mil para de pagar\", \"Trump taxa produtos do Brasil em 50%: o que fica mais caro\", \"STF manda bloquear bets: o que muda para quem aposta\". Ruins: \"Você não vai acreditar\", \"Veja o que aconteceu\"","thumb":"2 a 4 palavras em CAIXA ALTA","cenas":[{"midia":"...","texto":"..."}],"tags":["5 a 10 tags"]}. ' +
      'CURTO E DIRETO (retenção): o Short tem de 100 a 125 palavras (45 a 60 segundos), em 7 a 9 cenas curtas: gancho, o que aconteceu, por que importa, o número principal, o que diz cada lado (1 frase cada), o que acontece agora. Explique com calma e em ordem, mas sem repetir nada e sem frase de enchimento. ' +
      'PRENDER A PESSOA: a 1ª frase (até 12 palavras) é o detalhe mais chocante, curioso ou o número mais forte da notícia — nunca começa com o nome do órgão nem com "atenção, pessoal". ' +
      'Na 2ª frase abra uma curiosidade que só se resolve no fim (ex.: "mas o detalhe mais estranho é outro") e TERMINE essa 2ª cena com a frase exata "Fica até o fim pra entender toda a história." ' +
      'Cada frase traz UMA informação nova e concreta (nome, número, data, frase dita); nada de frase genérica ("isso pode mudar muita coisa"). ' +
      'Diga o que cada lado afirma em uma frase curta cada. Penúltima cena: o detalhe guardado. Última cena: pergunta neutra e curta + uma PALAVRA-CHAVE para comentar, no formato "Comenta SIM ou NÃO" (ou "Comenta CONCORDO ou DISCORDO") + "e se inscreve pra ver o fim dessa história" (tudo em até 22 palavras). Inclua no JSON "comenta":"SIM ou NÃO" (as palavras-chave usadas).' +
    ' EXPLIQUE O FATO COM CALMA, PARA QUEM NÃO ACOMPANHA POLÍTICA ENTENDER: conte em ordem, um passo de cada vez — o que aconteceu, quem fez (cargo na 1ª vez), por que isso importa e o que acontece agora. Frases curtas, uma ideia por frase, sem pressa e sem amontoar informação. ' +
    'NÃO PARE PARA DEFINIR PALAVRAS: nunca explique o significado de palavras ou órgãos que todo mundo conhece (delegado, policial, detetive, investigação, afastado, STF, Senado, ministro, relatório...) — nada de "o que é", "ou seja", "significa". Só uma sigla técnica rara (PEC, CPI, LDO) ganha no máximo meia frase DENTRO da própria frase do fato, nunca uma frase ou cena só para a definição.';
  const pedido = `Notícia (${n.fonteNome}, ${n.data || 'data não informada'}):\nTítulo: ${n.titulo}\nLink: ${n.link}\n\nTexto:\n${n.texto.slice(0, 4500)}\n\nFotos livres disponíveis:\n${fotos}`;
  let j = await ia(sistema, pedido);
  // Fora do tamanho (curto demais ~35 s ou longo demais >65 s): pede de novo dizendo o tamanho certo
  const contar = (x) => (x?.cenas || []).map((c) => String(c.texto || '')).join(' ').split(/\s+/).filter(Boolean).length;
  let total = contar(j);
  const dentro = (t) => t >= 90 && t <= 135;
  for (let tentativa = 0; tentativa < 2 && !dentro(total); tentativa++) {
    const curto = total < 90;
    const outra = await ia(
      sistema,
      pedido +
        (curto
          ? `\n\nATENÇÃO: o roteiro anterior teve só ${total} palavras (curto demais). Reescreva com 100 a 125 palavras no total, em 7 a 9 cenas, acrescentando o contexto que falta (por que importa, o que cada lado diz) — sem definir palavras e sem inventar nada que não esteja na notícia.`
          : `\n\nATENÇÃO: o roteiro anterior teve ${total} palavras (LONGO demais: as pessoas saem antes do fim). Reescreva com 100 a 125 palavras no total, em 7 a 9 cenas, cortando repetição, detalhe secundário e enchimento — mantendo o fato, os números principais e o que cada lado diz.`)
    ).catch(() => null);
    if (outra && Math.abs(contar(outra) - 112) < Math.abs(total - 112)) {
      j = outra;
      total = contar(outra);
    }
  }
  // Parou para definir palavra ("o que é um delegado", "ou seja", "significa")? Pede de novo, contando o fato sem definição
  const DEFINE = /\b(o que é (um|uma|o|a)\b|ou seja|significa|quer dizer)/i;
  if (DEFINE.test((j?.cenas || []).map((c) => c.texto).join(' '))) {
    const outra = await ia(
      sistema,
      pedido + '\n\nATENÇÃO: o roteiro anterior parou para DEFINIR palavras ("o que é", "ou seja", "significa"). Reescreva contando só o FATO, com calma e em ordem, sem definir nenhuma palavra, com 100 a 125 palavras.'
    ).catch(() => null);
    if (outra && !DEFINE.test((outra.cenas || []).map((c) => c.texto).join(' ')) && contar(outra) >= 90) {
      j = outra;
      total = contar(outra);
    }
  }
  console.log(`[politica-short] "${String(n.titulo).slice(0, 60)}" -> ${total} palavras`);
  // Ortografia: a legenda é o próprio texto narrado, então o texto já sai revisado
  if (Array.isArray(j.cenas) && j.cenas.length) {
    const rev = await revisarOrtografia([j.titulo || '', j.thumb || '', ...j.cenas.map((c) => c?.texto || '')]);
    if (j.titulo) j.titulo = rev[0];
    if (j.thumb) j.thumb = rev[1];
    j.cenas.forEach((c, i) => c && c.texto && (c.texto = rev[2 + i]));
  }
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
      // palavra-chave para comentar (como os Reels que bombam: muito comentário = mais distribuição)
      `💬 Comenta ${String(j.comenta || 'SIM ou NÃO').toUpperCase().slice(0, 30)} e segue pra ver o fim dessa história.`,
      `📰 Fonte: ${n.fonteNome} — ${n.link}`,
      RODAPE,
      CREDITO_FOTOS,
      '🔔 Inscreva-se: política explicada sem torcida, todos os dias.',
      `${hashtagsDe(tags)} #politica #shorts`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'política', 'notícias de política', 'brasil'],
    texto: inscricaoNoFim(textoDasCenas(j.cenas, n.imagens)),
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
    texto: inscricaoNoFim(partes.filter(Boolean).join('\n\n')),
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
      '"final":[{"midia":"vídeo atual: ...","texto":"..."}],"tags":["8 a 12 tags"],' +
      '"fatos":["6 a 12 fatos curtos COM os números, datas e nomes exatamente como estão nas fontes (com algarismos: 44 horas, 5x2, 2026, R$ 1.630)"]}. ' +
      (longo
        ? 'Vídeo longo: abertura com gancho (2 a 3 cenas: a 1ª frase é o fato mais forte ou o efeito no bolso, a 2ª abre uma curiosidade e termina com "Fica até o fim pra entender toda a história.") e convite para se inscrever; 5 a 7 blocos em ordem (contexto, linha do tempo, o que diz cada lado, números, o que acontece agora); final com resumo e pergunta neutra. Total de 1200 a 1500 palavras.'
        : 'Short: abertura de 1 cena com o gancho, 1 bloco de 7 a 9 cenas (o que aconteceu, contexto, números, o que diz cada lado, o que acontece agora), final de 1 cena com pergunta neutra + "se inscreve no canal". Total de 110 a 130 palavras (uns 50 a 60 segundos).'),
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
    texto: inscricaoNoFim(partes.filter(Boolean).join('\n\n')),
    fatos: (Array.isArray(j.fatos) ? j.fatos : []).map((f) => String(f).slice(0, 300)).slice(0, 14),
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
      const lista = frescas.slice(0, 150).map((n, i) => `${i + 1}. [${n.fonteNome}] ${n.titulo}`).join('\n');
      const emAlta = await assuntosEmAlta().catch(() => []);
      const j = await ia(
        'Você é editor de um canal brasileiro IMPARCIAL de política em SHORTS. Só vale notícia que faz a pessoa PARAR DE ROLAR A TELA e que o povo QUER saber. ' +
          'PRIORIDADES, nesta ordem: ' +
          '1) o assunto que está EM ALTA agora (veja a lista "EM ALTA NO BRASIL": notícia do mesmo assunto ganha muitos pontos); ' +
          '2) o que MEXE NO BOLSO de quem assiste: aumento da gasolina e do diesel, cesta básica e preço da comida, conta de luz, imposto novo ou maior, salário mínimo, aposentadoria/INSS, Bolsa Família e benefícios, Pix, juros, aluguel, bets; CRISE no Brasil ou no mundo que chega no bolso; ' +
          'notícia BOMBÁSTICA (grande, inesperada, todo mundo vai comentar) é nota 9 ou 10; ' +
          '3) POLÊMICAS: decisões e polêmicas do governo atual, e também da oposição, do Congresso e do STF; frase polêmica, briga pública, escândalo e investigação com nomes, gasto ou salário que choca, reviravolta; ' +
          '4) TRUMP e EUA, e o que lá fora afeta o Brasil (tarifas, dólar, relação com o Brasil). Das outras notícias do mundo, só se forem enormes. ' +
          'Nomes que o público MAIS PROCURA (notícia com eles ganha pontos, de qualquer lado): Nikolas Ferreira, Lula, Jair Bolsonaro, Michelle Bolsonaro, Eduardo Bolsonaro, Alexandre de Moraes, Tarcísio de Freitas, Fernando Haddad, Guilherme Boulos, Janja, André Janones, Pablo Marçal, Donald Trump. ' +
          'Notícia que ACABOU de sair (últimas horas) vale mais do que a de ontem. ' +
          'EVITE (ninguém assiste): tramitação e pauta do Congresso sem efeito concreto, agenda, nota de rotina, homenagem, reunião sem resultado, notícia regional pequena, ' +
          'economia técnica (mercado, bolsa, balanço de empresa) que não chega no bolso, duas notícias do mesmo assunto. ' +
          'Seja IMPARCIAL na escolha: polêmicas de lados diferentes, não só notícias boas ou ruins para um lado. ' +
          `Para cada escolhida dê "potencial" de 1 a 10 (quanto faz a pessoa parar de rolar). Responda só JSON: {"escolhidas":[{"n":número,"potencial":1-10}], no máximo ${quantas}}`,
        (emAlta.length ? `EM ALTA NO BRASIL AGORA:\n${emAlta.map((t) => `- ${t}`).join('\n')}\n\n` : '') + `NOTÍCIAS:\n${lista}`,
        { temperatura: 0.2 }
      );
      const brutas = (j.escolhidas || []).map((x) => (typeof x === 'object' ? x : { n: x }));
      const boas = brutas.filter((x) => Number(x.n) >= 1 && Number(x.n) <= frescas.length);
      if (boas.length) {
        const vistasN = new Set();
        escolhidas = boas
          .filter((x) => !vistasN.has(Number(x.n)) && vistasN.add(Number(x.n)))
          .slice(0, quantas)
          .map((x) => ({ ...frescas[Number(x.n) - 1], potencial: Math.max(1, Math.min(10, Math.round(Number(x.potencial) || 5))) }));
      }
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
        ...(bruta.potencial ? { potencial: bruta.potencial } : {}),
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
        'se a notícia não der o número, "documento: | <nome do documento>". SÓ use "documento" para texto que tramita ou foi publicado (projeto, PEC, PL, MP, lei, decreto, relatório de CPI). ' +
        'NUNCA para resultado de eleição, apuração, denúncia, alegação de fraude, pedido de anulação, decisão de tribunal, pesquisa ou discurso: nesses casos use "foto de:" da pessoa ou "foto real:" do lugar/órgão (ex.: "foto real: TSE sede Brasília"). ' +
        'Lugar só se a frase fala dele; nunca cartão-postal sem relação com a frase (Cristo Redentor, praia, paisagem de cidade). ' +
        '4) "documentos: <A>; <B>; <C>" (cada um no formato do item 3, sem o "documento:") quando a frase fala de VÁRIOS documentos (ex.: "quatro propostas"): liste os que a notícia cita. ' +
        '5) "foto real: <TÍTULO EXATO do artigo da Wikipédia em português do lugar ou da instituição>" quando a frase fala de uma empresa, emissora, órgão, prédio ou lugar ' +
        '(ex.: TV Globo -> "foto real: Estúdios Globo"; Senado -> "foto real: Senado Federal do Brasil"; Câmara -> "foto real: Câmara dos Deputados do Brasil"; ' +
        'STF -> "foto real: Supremo Tribunal Federal"; Planalto -> "foto real: Palácio do Planalto"; Polícia Federal -> "foto real: Polícia Federal (Brasil)"; ' +
        'Petrobras -> "foto real: Petrobras"; Banco Central -> "foto real: Banco Central do Brasil"). Se falou da Globo, mostra a Globo; se falou do Senado, mostra o Senado. ' +
        '6) Se a cena tem "imagem: https://..." (foto da própria notícia) e a frase é sobre o fato principal, mantenha igual. ' +
        'Varie: a MESMA pessoa aparece no máximo em 2 cenas. Nas outras, mostre a COISA de que a frase fala, com detalhe: o objeto, o lugar, o órgão, o documento ' +
        '(ex.: frase sobre imposto -> "foto real: Imposto de renda no Brasil"; sobre apostas -> "foto real: Apostas esportivas"; sobre o Bolsa Família -> "foto real: Bolsa Família"; sobre a votação -> "foto real: Câmara dos Deputados do Brasil"; sobre big techs/redes sociais -> "foto real: Googleplex", "foto real: Meta Platforms headquarters", "foto real: data center", "foto real: smartphone redes sociais"; sobre combustível -> "foto real: posto de gasolina Brasil"). ' +
        'O ASSUNTO da notícia manda: se a notícia é sobre big techs, a maioria das cenas mostra big techs (sedes, celulares, aplicativos, data centers), não o político que falou. Nunca invente nome, número ou documento que não está na notícia. ' +
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
    if (/^documentos?:/i.test(m)) {
      // Cartão "documento em discussão" só para texto legislativo/oficial de verdade
      const itens = m.replace(/^[^:]+:\s*/, '').split(';').map((x) => x.trim()).filter(ehDocumentoOficial);
      if (!itens.length) return '';
      return /^documentos:/i.test(m) && itens.length > 1 ? `documentos: ${itens.join('; ')}` : `documento: ${itens[0]}`;
    }
    return /^(foto de|foto real|imagem|pessoas):/i.test(m) ? m : '';
  });
}

/** "PEC 18/2025 | Segurança pública", "| Projeto de lei das fake news": sim. "| Resultado da eleição": não. */
export function ehDocumentoOficial(t) {
  const x = String(t || '');
  return /\b(PEC|PLP|PLN|PLV|PDL|PL|MPV?|PRS|PDC)\s*\d/i.test(x) ||
    /\b(projeto de lei|proposta de emenda|emenda constitucional|medida provis[óo]ria|lei complementar|lei n|decreto|portaria|relat[óo]rio (final )?da CPI|or[çc]amento de 20\d\d|LDO|LOA)\b/i.test(x);
}

// ───────────────────────── Ilustrações animadas (estilo explicador) ─────────────────────────
// Cada cena pode ganhar uma ilustração desenhada pelo Compilador (carimbo, placar, checklist, calendário...).
// A IA monta os dados SÓ com o que está na notícia; aqui conferimos cada número antes de aceitar.
// A foto da cena continua sendo buscada: é o plano B se a ilustração não puder ser desenhada.

const QUEM_OK = ['pessoa', 'trabalhador', 'aposentado', 'familia', 'empresa', 'loja', 'banco', 'maquininha', 'bet', 'casa', 'celular', 'computador', 'prefeitura', 'cofre', 'governo', 'camara', 'senado', 'stf', 'policia', 'escola', 'hospital', 'urna', 'povo'];
const TIPOS_ILUSTRACAO = ['carimbo', 'placar', 'versus', 'checklist', 'comparacao', 'calendario', 'numero', 'lista', 'linhaTempo', 'pergunta', 'foto', 'inscreva', 'fluxo', 'icone', 'fala', 'mapa', 'documento', 'caminho', 'quadroFotos', 'dinheiro', 'divisao', 'conexao', 'plenario', 'recibo', 'pix', 'rota', 'impacto'];
const LUGARES_CAMINHO = ['camara', 'senado', 'planalto', 'stf', 'urna', 'policia', 'dinheiro', 'povo', 'escola', 'hospital'];
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

/** Todos os números do texto aparecem INTEIROS na notícia (o "9" não vale por estar dentro de "2,9"). */
function numerosExatos(t, material) {
  const nums = String(t ?? '').match(/\d+(?:[.,]\d+)*/g) || [];
  return nums.every((n) => new RegExp(`(^|[^\\d.,])${n.replace(/[.]/g, '\\.')}(?![\\d]|[.,]\\d)`).test(material));
}

const semAc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Limpa e confere uma ilustração da IA. Devolve o objeto pronto ou null (descartada). */
const VAZIAS = new Set('para pela pelo pelos pelas como mais menos sobre entre depois antes ainda quando onde porque isso esse essa este esta estes essas esses aquele aquela muito muita muitos muitas outro outra outros outras todo toda todos todas cada mesmo mesma sera serao foram seria pode podem deve devem diz disse dizem fala falou tambem apenas agora hoje ontem amanha voce voces nosso nossa seus suas dele dela deles delas fazer feito sendo tinha tem tenho temos tera teria assim entao pois desde ate'.split(' '));
const raizes = (t) =>
  new Set(
    String(t || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .split(/[^a-z0-9%]+/)
      .filter((w) => (w.length >= 4 && !VAZIAS.has(w)) || /\d/.test(w))
      .map((w) => (/\d/.test(w) ? w.replace(/[^0-9]/g, '') : w.slice(0, 5)))
      .filter(Boolean)
  );
/** O conteúdo da ilustração (sem etiqueta) tem palavra forte em comum com a frase que está sendo narrada? */
export function ilustracaoBateComFrase(ilu, frase) {
  const daFrase = raizes(frase);
  if (!daFrase.size) return true;
  const { etiqueta, tipo, mascote, cor, ...resto } = ilu || {};
  const doDesenho = raizes(JSON.stringify(resto).replace(/"[a-zA-Z]+":/g, ' '));
  for (const r of doDesenho) if (daFrase.has(r)) return true;
  return false;
}

export function conferirIlustracao(bruta, material) {
  const r = conferirIlustracaoTipo(bruta, material);
  if (!r) return null;
  // Trava geral: todo número escrito em qualquer texto da ilustração tem que estar no material
  const textos = JSON.stringify(r, (k, v) => (['tipo', 'valor', 'total', 'minimo', 'dia', 'ano', 'cor'].includes(k) ? undefined : v));
  const nums = (textos.match(/\d+(?:[.,]\d+)*/g) || []).filter((n) => n.length >= 2 || /^\d$/.test(n) === false);
  for (const n of nums) if (!numeroNoMaterial(n, material) && !material.includes(n)) return null;
  return r;
}

function conferirIlustracaoTipo(bruta, material) {
  if (!bruta || typeof bruta !== 'object' || !TIPOS_ILUSTRACAO.includes(bruta.tipo)) return null;
  const temNum = (v) => numeroNoMaterial(v, material);
  // Título é opcional (a IA às vezes não manda): usa a etiqueta ou um título padrão do tipo
  const PADRAO = { fluxo: 'Passo a passo', icone: 'Entenda', fala: 'O que disse', foto: '', carimbo: 'Decisão oficial', placar: 'O placar', versus: 'Lado a lado', checklist: 'O que muda', comparacao: 'Duas propostas', calendario: 'A data', numero: 'O número', lista: 'O que muda', linhaTempo: 'Como chegou aqui', pergunta: 'E você?', mapa: 'Onde foi', documento: 'O que diz o texto', caminho: 'O caminho', quadroFotos: 'Quem está no caso', dinheiro: 'Para onde vai', divisao: 'Como divide', conexao: 'Como funciona', plenario: 'A votação', recibo: 'Quanto custou', pix: 'O dinheiro', rota: 'A viagem', impacto: '' };
  const etiqueta = cortar(bruta.etiqueta || bruta.tag, 22);
  const titulo = cortar(bruta.titulo || bruta.title, 40) || PADRAO[bruta.tipo];
  const base = {
    tipo: bruta.tipo,
    etiqueta: etiqueta || '',
    titulo,
    destaque: cortar(bruta.destaque, 30),
    // notícia ruim para o povo (preço sobe, imposto, crise, corte, morte) = carinha triste; boa = carinha feliz
    ...(['ruim', 'bom'].includes(bruta.clima) ? { clima: bruta.clima } : {}),
  };
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
      const pct = bruta.sufixo === '%' || new RegExp(`${String(linhas[0].valor).replace('.', '[,.]')}\\s*%`).test(material);
      return { ...base, linhas, ...(total ? { total } : {}), ...(minimo ? { minimo } : {}), nota: cortar(bruta.nota, 40), ...(pct ? { sufixo: '%', ...(total ? {} : { total: 100 }) } : {}) };
    }
    case 'versus': {
      const a = { valor: numeroDe(bruta.a?.valor), rotulo: cortar(bruta.a?.rotulo, 18) };
      const b = { valor: numeroDe(bruta.b?.valor), rotulo: cortar(bruta.b?.rotulo, 18) };
      if (a.valor == null || b.valor == null || !temNum(a.valor) || !temNum(b.valor)) return null;
      // percentual: se a notícia escreve "47,03%", mostra com o %
      const pct = bruta.sufixo === '%' || new RegExp(`${String(a.valor).replace('.', '[,.]')}\\s*%`).test(material);
      return { ...base, a, b, nota: cortar(bruta.nota, 44), ...(pct ? { sufixo: '%' } : {}) };
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
    case 'fluxo': {
      const passos = lista(bruta.passos, 4).map((p) => ({ icone: cortar(p?.icone, 4), texto: cortar(p?.texto, 30) })).filter((p) => p.texto);
      return passos.length >= 2 ? { ...base, passos } : null;
    }
    case 'icone': {
      const texto = cortar(bruta.texto, 60);
      // Definição de palavra ("Delegado: policial que investiga", "Afastar: tirar do cargo") não entra: o dono não quer
      if (/^[^:]{2,30}:\s|\b(o que é|significa|quer dizer|ou seja)\b/i.test(texto)) return null;
      return texto ? { ...base, icone: cortar(bruta.icone, 4) || '💡', texto } : null;
    }
    case 'fala': {
      const nome = cortar(bruta.nome, 40);
      const texto = cortar(bruta.texto, 90);
      // o nome precisa estar no material (não inventa quem falou)
      if (!texto || (nome && !semAc(material).includes(semAc(nome).split(' ').slice(-1)[0]))) return null;
      // quem fala é PESSOA: empresa, órgão, partido ou instituição não ganham "foto de quem falou"
      if (nome && /\b(sociedade|ltda|s\.?a\.?|banco|partido|minist[eé]rio|governo|tribunal|c[aâ]mara|senado|pol[ií]cia|associa[cç][aã]o|confedera|federa[cç][aã]o|instituto|empresa|fintech|cr[eé]dito|grupo|secretaria|prefeitura|comiss[aã]o|conselho|ag[eê]ncia)\b/i.test(nome)) return null;
      return { ...base, nome, texto };
    }
    case 'mapa': {
      // o lugar tem que estar no material (estado do Brasil ou país)
      const lugar = cortar(bruta.uf || bruta.estado || bruta.pais || bruta.lugar, 30);
      if (!lugar || !semAc(material).includes(semAc(lugar))) return null;
      const ehPais = !!bruta.pais;
      return { ...base, ...(ehPais ? { pais: lugar } : { uf: lugar }), rotulo: cortar(bruta.rotulo || lugar, 30), texto: cortar(bruta.texto, 30) };
    }
    case 'documento': {
      const trechos = lista(bruta.trechos, 2).map((t) => cortar(t, 90)).filter(Boolean);
      const documento = cortar(bruta.documento, 30);
      if (!trechos.length || !documento) return null;
      return { ...base, orgao: cortar(bruta.orgao, 40).toUpperCase(), documento, trechos, ...(bruta.carimbo ? { carimbo: cortar(bruta.carimbo, 14).toUpperCase(), cor: bruta.cor === 'vermelho' ? 'vermelho' : 'verde' } : {}) };
    }
    case 'caminho': {
      const etapas = lista(bruta.etapas, 4)
        .map((e) => ({ lugar: LUGARES_CAMINHO.includes(e?.lugar) ? e.lugar : '', texto: cortar(e?.texto, 30), status: cortar(e?.status, 14) }))
        .filter((e) => e.lugar && e.texto);
      if (etapas.length < 2) return null;
      const atual = Math.max(0, Math.min(etapas.length - 1, Math.round(numeroDe(bruta.atual) ?? etapas.length - 1)));
      return { ...base, etapas, atual };
    }
    case 'quadroFotos': {
      // pessoas citadas na notícia: a foto real de cada uma é buscada depois (sem foto, aparece a silhueta com o nome)
      const fotos = lista(bruta.fotos || bruta.pessoas, 4)
        .map((f) => ({ nome: cortar(typeof f === 'string' ? f : f?.nome, 26) }))
        .filter((f) => f.nome && semAc(material).includes(semAc(f.nome).split(' ').slice(-1)[0]))
        // quadro de fotos é de PESSOAS: empresa/órgão/partido não entram (virava silhueta com nome de empresa)
        .filter((f) => !/\b(ltda|s\.?a\.?|sociedade|banco|partido|gaming|bet|empresa|grupo|fintech|cr[eé]dito|minist[eé]rio|tribunal|pol[ií]cia|governo|instituto|associa)\b/i.test(f.nome));
      return fotos.length >= 2 ? { ...base, fotos, texto: cortar(bruta.texto, 40) } : null;
    }
    // ───── Desenhos que explicam o MECANISMO ─────
    case 'dinheiro': {
      const ator = (a) => (a && typeof a === 'object' ? { quem: QUEM_OK.includes(a.quem) ? a.quem : 'pessoa', texto: cortar(a.texto || a.nome, 26), ...(a.valor && temNum(a.valor) ? { valor: cortar(a.valor, 16) } : {}) } : null);
      const de = ator(bruta.de);
      const para = lista(Array.isArray(bruta.para) ? bruta.para : [bruta.para], 2).map(ator).filter((a) => a && a.texto);
      if (!de || !de.texto || !para.length) return null;
      const valor = bruta.valor && temNum(bruta.valor) ? cortar(bruta.valor, 16) : '';
      return { ...base, de: { quem: de.quem, texto: de.texto }, para, ...(valor ? { valor } : {}), texto: cortar(bruta.texto, 48) };
    }
    case 'divisao': {
      const partes = lista(bruta.partes, 4).map((p) => ({ rotulo: cortar(p?.rotulo, 24), valor: numeroDe(p?.valor), ...(p?.cor === 'vermelho' || p?.cor === 'verde' ? { cor: p.cor } : {}) })).filter((p) => p.rotulo && p.valor > 0 && temNum(p.valor));
      const total = cortar(bruta.total, 14);
      if (partes.length < 2 || !total || (/\d/.test(total) && !temNum(total))) return null;
      return { ...base, total, totalTexto: cortar(bruta.totalTexto, 30), partes, prefixo: cortar(bruta.prefixo, 4), sufixo: cortar(bruta.sufixo, 6) };
    }
    case 'conexao': {
      const no = (a) => (a && typeof a === 'object' ? { quem: QUEM_OK.includes(a.quem) ? a.quem : '', texto: cortar(a.texto || a.nome, 24) } : null);
      const pontas = lista(bruta.pontas, 4).map(no).filter((a) => a && a.texto);
      const centro = no(bruta.centro) || { quem: 'computador', texto: 'Sistema' };
      if (pontas.length < 2) return null;
      return { ...base, centro: { quem: centro.quem || 'computador', texto: centro.texto || 'Sistema' }, pontas, texto: cortar(bruta.texto, 50) };
    }
    case 'plenario': {
      const sim = numeroDe(bruta.sim);
      const nao = numeroDe(bruta.nao) || 0;
      if (sim == null || !temNum(sim) || (nao && !temNum(nao))) return null;
      const casa = ['camara', 'senado', 'stf'].includes(bruta.casa) ? bruta.casa : 'camara';
      const total = temNum(bruta.total) ? numeroDe(bruta.total) : { camara: 513, senado: 81, stf: 11 }[casa];
      if (sim + nao > total) return null;
      const minimo = bruta.minimo && temNum(bruta.minimo) ? numeroDe(bruta.minimo) : 0;
      return { ...base, casa, total, sim, nao, ...(minimo ? { minimo } : {}), rotulo: cortar(bruta.rotulo, 24) };
    }
    // ───── Desenhos "de aplicativo" (recibo, transferência, viagem, frase de impacto) ─────
    case 'recibo': {
      // cada valor do recibo tem que estar na notícia (o "valor" fica fora da trava geral: confere aqui)
      const itens = lista(bruta.itens, 4).map((i) => ({ texto: cortar(i?.texto, 28), valor: cortar(i?.valor, 16) })).filter((i) => i.texto && i.valor && temNum(i.valor) && numerosExatos(i.valor, material));
      if (itens.length < 2) return null;
      const total = bruta.total && temNum(bruta.total) && numerosExatos(bruta.total, material) ? cortar(bruta.total, 18) : '';
      return { ...base, cabecalho: cortar(bruta.cabecalho, 26), itens, ...(total ? { total, totalTexto: cortar(bruta.totalTexto, 12) } : {}) };
    }
    case 'pix': {
      const valor = cortar(bruta.valor, 18);
      if (!valor || !temNum(valor) || !numerosExatos(valor, material) || !numerosExatos(bruta.texto, material)) return null;
      const de = cortar(bruta.de, 24);
      const para = cortar(bruta.para, 24);
      if (!de && !para) return null;
      return { ...base, acao: cortar(bruta.acao, 30), valor, rotuloValor: cortar(bruta.rotuloValor, 22), de, para, status: bruta.status === 'pendente' ? 'pendente' : 'ok', statusTexto: cortar(bruta.statusTexto, 20), texto: cortar(bruta.texto, 50) };
    }
    case 'rota': {
      // os dois lugares têm que estar na notícia
      const de = cortar(bruta.de, 20);
      const para = cortar(bruta.para, 20);
      const m = semAc(material);
      if (!de || !para || !m.includes(semAc(de)) || !m.includes(semAc(para))) return null;
      return { ...base, de, para, meio: ['aviao', 'carro', 'navio', 'onibus'].includes(bruta.meio) ? bruta.meio : 'aviao', deTexto: cortar(bruta.deTexto, 24), paraTexto: cortar(bruta.paraTexto, 24), texto: cortar(bruta.texto, 34) };
    }
    case 'impacto': {
      // a frase-chave da notícia, sem opinião: fato ou número (canal imparcial)
      const texto = cortar(bruta.texto, 40);
      if (!texto || texto.split(' ').length > 7) return null;
      if (/farra|roub|ladr|vergonh|absurd|esc[aâ]ndal|golpe|mentir|corrup|bandid|mamata|lixo|rid[ií]cul/i.test(`${texto} ${bruta.sub || ''}`)) return null;
      // todo número da frase (até de 1 dígito: "R$ 9 milhões") tem que estar na notícia
      if (!numerosExatos(`${texto} ${bruta.sub || ''}`, material)) return null;
      return { ...base, titulo: '', etiqueta: '', semTitulo: true, texto, destaque: cortar(bruta.destaque, 30), sub: cortar(bruta.sub, 44), cor: bruta.cor === 'vermelho' ? 'vermelho' : 'ouro' };
    }
    case 'inscreva':
      return { ...base, titulo: cortar(bruta.titulo, 40) || 'Se inscreve!', texto: cortar(bruta.texto || 'E você, o que acha?', 40) };
    case 'foto':
      // a foto real da cena num cartão; o nome embaixo vem da busca da cena (não da IA)
      return { ...base, titulo: cortar(bruta.titulo || bruta.title, 40) };
    case 'pergunta':
      return { ...base, texto: cortar(bruta.texto || 'E você?', 30) };
    default:
      return null;
  }
}

/**
 * Escolhe as ilustrações das cenas. Devolve um array (uma por cena; null = cena fica com a foto) ou null se a IA falhar.
 */
export async function planejarIlustracoes(cenas, titulo = '', noticia = '', { canal = 'politica' } = {}) {
  // Vídeo longo (dezenas de cenas): pede em grupos de 12 para a resposta não vir cortada
  if (cenas.length > 14) {
    const saida = [];
    let algum = false;
    for (let i = 0; i < cenas.length; i += 12) {
      const parte = await planejarIlustracoesLote(cenas.slice(i, i + 12), titulo, noticia, i + 12 >= cenas.length, canal);
      if (parte) algum = true;
      saida.push(...(parte || cenas.slice(i, i + 12).map(() => null)));
    }
    return algum ? saida : null;
  }
  return planejarIlustracoesLote(cenas, titulo, noticia, true, canal);
}

export const diagIlustracao = { erros: [] }; // último problema da IA de ilustração (aparece no diagnóstico)

async function planejarIlustracoesLote(cenas, titulo, noticia, temFinal, canal = 'politica', semPessoa = false) {
  let j;
  try {
    j = await ia(
      (canal === 'games'
        ? 'Você é o diretor de arte do canal brasileiro de GAMES "Próxima Fase", em vídeo curto no estilo "explicador" com ILUSTRAÇÕES ANIMADAS (tom animado e jovem). ' +
          'Para games: preço -> numero; data de lançamento ou contagem regressiva -> calendario ou numero; plataformas/edições/o que vem no jogo -> lista ou checklist; ' +
          'jogo antigo x novo -> comparacao; história da série -> linhaTempo; requisitos -> checklist. Não use "fala" nem "foto". As regras abaixo sobre política valem só para fatos e números. '
        : '') +
      'Você é o diretor de arte de um canal brasileiro IMPARCIAL de notícias de política em vídeo curto, no estilo "explicador" com ILUSTRAÇÕES ANIMADAS ' +
        '(como canais de contabilidade que explicam leis: etiqueta pequena, título curto e UM desenho que explica a frase). ' +
        'REGRA PRINCIPAL: a ilustração EXPLICA o que a frase está dizendo — quem assiste SEM SOM tem que entender a ideia só olhando. TODAS as cenas ganham ilustração. ' +
        'Escolha o tipo pelo que a frase diz: número/percentual/valor -> numero, placar ou versus; votação -> placar ou versus; data/prazo -> calendario; ' +
        'o que muda / regras / itens -> checklist ou lista; dois lados ou propostas -> comparacao; processo, etapas, tramitação ou causa e consequência -> fluxo; ' +
        'aprovado/vetado/arquivado/assinado -> carimbo; histórico -> linhaTempo; uma ação ou situação que não tem número (ex.: delegados afastados, crise interna, investigação aberta) -> icone com O FATO em poucas palavras (NUNCA a definição de uma palavra: nada de "Delegado: policial que investiga", "Afastar: tirar do cargo", "STF: a mais alta corte"); ' +
        'o que alguém DISSE ou defende -> fala (foto real da pessoa com um balão "em resumo", com suas palavras, nunca citação inventada). ' +
        'onde aconteceu (estado do Brasil ou outro país) -> mapa; o que diz uma lei, decisão, relatório ou denúncia -> documento (com o trecho principal); ' +
        'por onde a proposta passa (Câmara, Senado, Presidente, STF) ou caminho do dinheiro/da investigação -> caminho (desenho dos prédios com o papel indo de um ao outro); ' +
        'várias pessoas envolvidas no mesmo caso -> quadroFotos (quadro de investigação com a foto de cada um ligada por fio). ' +
        'MAIS IMPORTANTE: mostre COMO A COISA FUNCIONA, não só o dado. Dinheiro saindo de alguém e indo para alguém (imposto, salário, aposentadoria, benefício, multa, taxa, aposta, repasse, emenda) -> dinheiro; ' +
        'um valor sendo dividido ("de cada R$ 100...", "a alíquota é 27%", "o governo fica com X e a empresa com Y") -> divisao; ' +
        'um sistema, cadastro ou órgão ligando/fiscalizando vários outros (cadastro único, investigação ligando empresas, repasse a estados e municípios) -> conexao; ' +
        'votação na Câmara, no Senado ou no STF com o número de votos -> plenario. Prefira esses quatro sempre que a frase permitir. ' +
        'DESENHOS DE APLICATIVO (prendem muito, use sempre que a frase permitir): custo ou gasto com 2 a 4 partes (viagem, obra, contrato, salários) -> recibo; ' +
        'dinheiro transferido, doado, arrecadado ou pago (vaquinha, doação, Pix, multa paga, repasse a alguém) -> pix; ' +
        'viagem ou deslocamento de um lugar para outro (presidente viaja, preso transferido, comitiva vai a outro país) -> rota; ' +
        'o fato mais forte da notícia em 2 a 6 palavras (um número chocante ou o resultado principal, SEM opinião e sem adjetivo) -> impacto, no máximo 1 vez no vídeo, de preferência no fim ou na cena 1. ' +
        'Use bastante mapa, documento, caminho e quadroFotos: quanto mais detalhada e desenhada a explicação, mais a pessoa fica no vídeo. ' +
        'Use "foto" SÓ para apresentar quem é a pessoa ou mostrar o lugar quando nada acima serve (a foto real aparece num cartão). ' +        (temFinal ? 'A última cena (pergunta para os comentários) usa "pergunta". ' : 'Estas cenas são um trecho do meio do vídeo: não use "pergunta". ') +
        'Não repita o mesmo tipo em cenas seguidas. ' +
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
        'pergunta {texto:"E você? 👇"}; ' +
        'fluxo {passos:[{icone:"🏛️", texto:"Câmara aprova"},{icone:"⚖️", texto:"Senado vota"},{icone:"✍️", texto:"Presidente sanciona"}]} (2 a 4 passos curtos, na ordem); ' +
        'icone {icone:"🚨", texto:"Dois delegados afastados da chefia"} (1 emoji simples + o fato da frase em até 8 palavras; nunca definição de palavra); ' +
        'fala {nome:"Hugo Motta", texto:"Diz que a votação fica para depois do feriado"} (resumo de até 12 palavras do que a frase diz que a pessoa falou; o nome tem que estar na frase ou na notícia); ' +
        'foto {} (só etiqueta e titulo: mostra a foto real da cena). ' +
        'mapa {uf:"Paraná"} ou {pais:"Paraguai"}, rotulo:"Paraná", texto:"26 presos" (o lugar tem que estar na notícia; texto curto opcional); ' +
        'documento {orgao:"SENADO FEDERAL", documento:"PEC da Segurança", trechos:["frase principal do texto, com suas palavras, até 14 palavras"], carimbo:"APROVADA" (opcional), cor:"verde"|"vermelho"}; ' +
        'caminho {etapas:[{lugar:"camara"|"senado"|"planalto"|"stf"|"urna"|"policia"|"dinheiro"|"povo"|"escola"|"hospital", texto:"Câmara", status:"Aprovada"|"Votando"|"Depois"}], atual:1} (2 a 4 etapas; atual = índice da etapa onde está agora, começando em 0); ' +
        'dinheiro {de:{quem:"maquininha", texto:"Compra de R$ 100"}, para:[{quem:"loja", texto:"Loja", valor:"R$ 73"},{quem:"governo", texto:"Governo", valor:"R$ 27"}], valor:"R$ 7 bi" (opcional, o valor que sai), texto:"frase curta explicando"} ' +
        '(para: 1 ou 2 destinos; quem = pessoa|trabalhador|aposentado|familia|empresa|loja|banco|maquininha|bet|casa|celular|computador|prefeitura|cofre|governo|camara|senado|stf|policia|escola|hospital|povo); ' +
        'divisao {total:"R$ 100", totalTexto:"em cada compra", prefixo:"R$ ", sufixo:"", partes:[{rotulo:"Fica com a loja", valor:73},{rotulo:"Vai para o governo", valor:27, cor:"vermelho"}]} (2 a 4 partes; percentual: prefixo "" e sufixo "%"); ' +
        'conexao {centro:{quem:"computador", texto:"Cadastro único"}, pontas:[{quem:"casa", texto:"Cartório"},{quem:"prefeitura", texto:"Prefeitura"},{quem:"governo", texto:"Receita"}], texto:"..."} (2 a 4 pontas); ' +
        'plenario {casa:"camara"|"senado"|"stf", sim:308, nao:150, total:513, minimo:308 (só se a notícia disser)}; ' +
        'quadroFotos {fotos:[{nome:"Fulano de Tal"},{nome:"Ciclano"}], texto:"Investigados pela PF"} (2 a 4 pessoas citadas na notícia, nome completo como está nela); ' +
        'recibo {cabecalho:"Viagem oficial", itens:[{texto:"Avião da FAB", valor:"R$ 1,1 mi"},{texto:"Hospedagem", valor:"R$ 1,8 mi"}], total:"R$ 2,9 milhões", totalTexto:"TOTAL"} (2 a 4 itens; todos os valores escritos na notícia; total só se a notícia disser); ' +
        'pix {acao:"Vaquinha arrecadou", valor:"R$ 7 milhões", rotuloValor:"Valor", de:"Apoiadores", para:"Campanha do PT", status:"ok"|"pendente", statusTexto:"Concluído", texto:"em 3 dias"} (valor da notícia; de/para curtos); ' +
        'rota {de:"Brasília", para:"Turquia", meio:"aviao"|"carro"|"navio"|"onibus", deTexto:"Saída dia 20", paraTexto:"", texto:"Depois, Filipinas"} (os dois lugares escritos na notícia); ' +
        'impacto {texto:"R$ 2,9 milhões em 6 dias", destaque:"2,9", sub:"pagos com dinheiro público", cor:"ouro"|"vermelho"} (2 a 6 palavras, só fato; sub curto opcional); ' +
        'CENA 1 é onde a pessoa decide se fica ou pula: dê a ela a ilustração MAIS impactante que a frase permitir (número grande, foto da pessoa principal, carimbo, mapa) — nunca null, nunca lista longa. ' +
        'REGRA DE OURO: cada ilustração desenha SÓ o que a frase DAQUELA cena diz (os mesmos nomes, números e assunto, na mesma hora em que são falados). ' +
        'Nunca ponha numa cena um dado que é falado em outra cena; se a frase não tem nada para desenhar, use null. ' +
        (semPessoa
          ? 'NESTA RODADA é PROIBIDO usar "fala", "foto" e "quadroFotos" e é PROIBIDO null: desenhe o ASSUNTO da frase — o que acontece, como funciona, quanto custa, quem ganha e quem perde, onde, quando — ' +
            'com dinheiro, divisao, conexao, plenario, numero, versus, checklist, lista, fluxo, caminho, documento, mapa, calendario, carimbo, linhaTempo, comparacao ou icone. Se a frase não tem número, use fluxo (o que acontece, passo a passo) ou icone (o fato da frase em poucas palavras, nunca a definição de uma palavra). '
          : '') +
        'LUGAR: sempre que a frase citar um estado, cidade ou país, use mapa nessa frase (cidade -> o estado dela). ' +
        'PASSO A PASSO: o que acontece em etapas (como funciona, o que acontece agora, prazos) vira fluxo, caminho ou linhaTempo. ' +
        'CLIMA: em cada ilustração ponha "clima":"ruim" quando a frase é ruim para o povo (preço/imposto/conta sobe, crise, corte, demissão, perda de benefício, tragédia), "bom" quando é boa para o povo (preço cai, benefício novo, isenção) e "neutro" no resto. ' +
        'TODA ilustração tem "tipo", "etiqueta", "titulo", "destaque" e "clima" além dos campos do tipo. Percentual: valor com ponto (47.03) e "sufixo":"%". Responda só JSON: {"cenas":[{"n":1,"ilustracao":{...}|null}]}',
      cenas.map((c, i) => `${i + 1}. ${c.texto}`).join('\n') + `\n\nTítulo do vídeo: ${titulo}` + (noticia ? `\n\nTEXTO DA NOTÍCIA:\n${String(noticia).slice(0, 3500)}` : ''),
      { temperatura: 0.3 }
    );
  } catch (e) {
    diagIlustracao.erros = [...diagIlustracao.erros, String(e?.message || e).slice(0, 200)].slice(-5);
    console.log('[politica-ilustracao] IA falhou:', String(e?.message || e).slice(0, 200));
    return null;
  }
  const material = [noticia, titulo, ...cenas.map((c) => c.texto)].join('\n');
  const porN = new Map((j?.cenas || []).map((c) => [Number(c.n), c.ilustracao]));
  // Trava "a ilustração é do que está sendo FALADO": o desenho tem que ter pelo menos uma palavra forte (nome, número,
  // assunto) da própria frase da cena — senão é informação de outra parte da notícia e fica desencontrado da narração
  const saida = cenas.map((c, i) => {
    const r = conferirIlustracao(porN.get(i + 1), material);
    if (!r || ['inscreva', 'pergunta', 'foto'].includes(r.tipo)) return r;
    if (!ilustracaoBateComFrase(r, c.texto)) {
      diagIlustracao.foraDaFrase = (diagIlustracao.foraDaFrase || 0) + 1;
      return null;
    }
    return r;
  });
  const brutas = [...porN.values()].filter((x) => x && typeof x === 'object');
  diagIlustracao.sugeridas = (diagIlustracao.sugeridas || 0) + brutas.length;
  diagIlustracao.aceitas = (diagIlustracao.aceitas || 0) + saida.filter(Boolean).length;
  if (brutas.length && !saida.some(Boolean)) diagIlustracao.exemploRecusado = JSON.stringify(brutas[0]).slice(0, 400);
  // Política: o vídeo não pode virar "só a foto do Lula". Pessoa (fala/foto/quadro) no máximo 2 vezes por trecho;
  // as cenas que sobraram sem desenho ou com pessoa demais pedem de novo, agora explicando o ASSUNTO
  if (canal === 'politica' && !semPessoa) {
    const PESSOA = new Set(['fala', 'foto', 'quadroFotos']);
    let pessoas = 0;
    const refazer = [];
    saida.forEach((r, i) => {
      if (r && ['inscreva', 'pergunta'].includes(r.tipo)) return;
      if (temFinal && i === saida.length - 1 && !r) return; // última cena: pergunta
      if (r && PESSOA.has(r.tipo)) {
        pessoas += 1;
        if (pessoas <= 2) return;
      } else if (r) return;
      refazer.push(i);
    });
    if (refazer.length) {
      const novas = await planejarIlustracoesLote(refazer.map((i) => cenas[i]), titulo, noticia, false, canal, true).catch(() => null);
      let trocadas = 0;
      refazer.forEach((i, k) => {
        const r = novas?.[k];
        if (r && !PESSOA.has(r.tipo)) {
          saida[i] = r;
          trocadas += 1;
        } // senão fica como estava (o cartão da pessoa ao menos tem o resumo escrito)
      });
      console.log(`[politica-ilustracao] refeitas ${trocadas}/${refazer.length} cenas sem desenho ou com pessoa demais`);
    }
  }
  if (!semPessoa) await revisarIlustracoes(saida.filter(Boolean));
  return saida;
}
