// Radar de Ofertas — abre UMA página de vendas pelo link e devolve só o texto visível (só no servidor).
// É uma leitura por análise, pedida por você: sem login em conta de terceiros, sem varredura em lote
// e sem baixar imagem, vídeo ou qualquer arquivo da página.
import { lookup } from 'dns/promises';
import { isIP } from 'net';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SALTOS = 4;

function ipPrivado(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    // IPv4 escrito dentro de um IPv6 (::ffff:127.0.0.1 ou ::ffff:7f00:1): vale a regra do IPv4
    const mapeado = v.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
    if (mapeado) {
      if (mapeado[1]) return ipPrivado(mapeado[1]);
      const a = parseInt(mapeado[2], 16);
      const b = parseInt(mapeado[3], 16);
      return ipPrivado(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
    }
    // só passa endereço público de verdade (faixa 2000::/3); local, interno e especiais ficam de fora
    const primeiro = parseInt(v.split(':')[0] || '0', 16);
    return !(primeiro >= 0x2000 && primeiro <= 0x3fff);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Só aceita endereço público da internet (http/https). Barra rede interna e endereços locais. */
async function validarEndereco(endereco) {
  let u;
  try { u = new URL(endereco); } catch { throw new Error('Esse link não parece um endereço válido.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('O link precisa começar com http:// ou https://');
  if (u.username || u.password) throw new Error('Link com usuário e senha não é aceito.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Esse endereço não é uma página pública.');
  const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error('Não encontrei esse site. Confira o link.'); });
  if (!ips.length || ips.some((i) => ipPrivado(i.address))) throw new Error('Esse endereço não é uma página pública.');
  return u;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', copy: '©', reg: '®' };

/** Tira o que não é texto visível (scripts, estilos, menus técnicos) e devolve o texto corrido. */
export function htmlParaTexto(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10) || 32))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function contarPalavras(texto) {
  return (String(texto || '').match(/[\p{L}\p{N}]+/gu) || []).length;
}

/** Abre a página e devolve { texto, endereco }. Lança erro com mensagem pronta para mostrar na tela. */
export async function lerPagina(endereco) {
  let atual = String(endereco || '').trim();
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const u = await validarEndereco(atual);
    const r = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YouvideoRadar/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    }).catch(() => { throw new Error('A página não respondeu. Tente de novo ou cole o texto dela.'); });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      atual = new URL(r.headers.get('location'), u).toString();
      continue;
    }
    if (!r.ok) throw new Error(`A página respondeu com erro ${r.status}. Abra o link no navegador e cole o texto dela aqui.`);
    const tipo = r.headers.get('content-type') || '';
    if (tipo && !/html|text\/plain/i.test(tipo)) throw new Error('Esse link não é uma página de texto.');
    const leitor = r.body.getReader();
    const partes = [];
    let recebido = 0;
    while (recebido < MAX_BYTES) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value);
      recebido += value.length;
    }
    leitor.cancel().catch(() => {});
    const html = Buffer.concat(partes.map((p) => Buffer.from(p))).toString('utf8');
    return { texto: htmlParaTexto(html), endereco: u.toString() };
  }
  throw new Error('O link redireciona vezes demais.');
}
