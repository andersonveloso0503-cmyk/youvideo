// Radar de Ofertas — trava de originalidade (só no servidor).
// Da página de origem ficam guardados apenas CÓDIGOS (hash) de cada sequência de 5 palavras, nunca o texto.
// Depois de gerar a oferta, o mesmo corte é feito no texto novo: se os códigos baterem, tem cópia.
import { createHash } from 'crypto';
import { trechosDaOferta } from './ofertas';

export const TAMANHO_SEQUENCIA = 5; // palavras por sequência
export const PALAVRAS_SEGUIDAS = 8; // a partir de quantas palavras iguais em sequência o trecho é barrado
export const LIMITE_GERAL = 0.03; // acima disso (3% das sequências), a oferta inteira é refeita
const MAX_CODIGOS = 8000;
// 4 sequências de 5 palavras seguidas = 8 palavras seguidas iguais
const SEQUENCIAS_SEGUIDAS = PALAVRAS_SEGUIDAS - TAMANHO_SEQUENCIA + 1;

/** Palavras do texto, sem acento, sem pontuação e em minúsculas — e onde cada uma começa e termina no original. */
export function palavras(texto) {
  const out = [];
  const re = /[\p{L}\p{N}]+/gu;
  const s = String(texto || '');
  let m;
  while ((m = re.exec(s))) {
    out.push({ p: m[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), ini: m.index, fim: m.index + m[0].length });
  }
  return out;
}

function codigo(seq) {
  return createHash('sha256').update(seq).digest('base64url').slice(0, 11);
}

function codigosDe(lista) {
  const out = [];
  for (let i = 0; i + TAMANHO_SEQUENCIA <= lista.length; i++) {
    out.push(codigo(lista.slice(i, i + TAMANHO_SEQUENCIA).map((x) => x.p).join(' ')));
  }
  return out;
}

/** Códigos da página de origem (sem repetição). É só isso que fica salvo do texto dela. */
export function codigosDaOrigem(texto) {
  return [...new Set(codigosDe(palavras(texto)))].slice(0, MAX_CODIGOS);
}

/** Confere um texto contra os códigos da origem. Devolve as sequências que bateram e os trechos longos demais. */
export function conferirTexto(texto, conjunto) {
  const lista = palavras(texto);
  const cods = codigosDe(lista);
  const bate = cods.map((c) => conjunto.has(c));
  const trechos = [];
  let i = 0;
  while (i < bate.length) {
    if (!bate[i]) { i += 1; continue; }
    let j = i;
    while (j + 1 < bate.length && bate[j + 1]) j += 1;
    if (j - i + 1 >= SEQUENCIAS_SEGUIDAS) {
      const ini = lista[i].ini;
      const fim = lista[j + TAMANHO_SEQUENCIA - 1].fim;
      trechos.push(String(texto).slice(ini, fim));
    }
    i = j + 1;
  }
  return { total: cods.length, iguais: bate.filter(Boolean).length, trechos };
}

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Nomes comuns do nicho que não são marca de ninguém: nunca entram na lista de proibidos.
const NOMES_LIVRES = new Set(['jesus', 'deus', 'cristo', 'biblia', 'biblia sagrada', 'espirito santo', 'plr', 'pdf', 'word', 'canva', 'hotmart', 'kiwify', 'monetizze', 'whatsapp', 'instagram', 'facebook', 'youtube', 'brasil', 'pix']);

/** Limpa a lista de nomes próprios da origem (produto, marca, autor) que a oferta nova não pode usar. */
export function limparNomesProibidos(nomes, tituloDoProduto = '') {
  const meu = semAcento(tituloDoProduto);
  const vistos = new Set();
  return (Array.isArray(nomes) ? nomes : [])
    .map((n) => String(n || '').trim().slice(0, 80))
    .filter((n) => {
      const k = semAcento(n);
      if (k.length < 4 || NOMES_LIVRES.has(k) || vistos.has(k)) return false;
      if (meu && (meu === k || meu.includes(k))) return false; // o seu próprio título não é proibido
      vistos.add(k);
      return true;
    })
    .slice(0, 30);
}

/**
 * Trava completa da oferta. origem = { codigos: [...], nomesProibidos: [...] }.
 * Devolve { ok, proporcao, refazer, trechos: [{campo, texto}], nomes: [{campo, nome}] }.
 * ok = nenhum trecho de 8+ palavras igual, nenhum nome da origem e proporção geral dentro do limite.
 */
export function travaDaOferta(oferta, origem) {
  const conjunto = new Set(origem?.codigos || []);
  const nomes = origem?.nomesProibidos || [];
  let total = 0;
  let iguais = 0;
  const trechos = [];
  const nomesAchados = [];
  for (const { campo, texto } of trechosDaOferta(oferta)) {
    const r = conferirTexto(texto, conjunto);
    total += r.total;
    iguais += r.iguais;
    r.trechos.forEach((t) => trechos.push({ campo, texto: t }));
    const plano = ` ${semAcento(texto)} `;
    for (const n of nomes) {
      if (plano.includes(` ${semAcento(n)} `)) nomesAchados.push({ campo, nome: n });
    }
  }
  const proporcao = total ? iguais / total : 0;
  const refazer = proporcao > LIMITE_GERAL;
  return { ok: !trechos.length && !nomesAchados.length && !refazer, proporcao: Math.round(proporcao * 1000) / 1000, refazer, trechos, nomes: nomesAchados, conferidoEm: new Date().toISOString() };
}

/** O esqueleto são campos curtos escritos pela IA; se algum saiu copiado da origem, é apagado. */
export function limparEsqueleto(esqueleto, codigos) {
  const conjunto = new Set(codigos);
  const limpo = {};
  for (const [k, v] of Object.entries(esqueleto || {})) {
    if (typeof v === 'string') {
      limpo[k] = conferirTexto(v, conjunto).trechos.length ? '' : v;
    } else if (Array.isArray(v)) {
      limpo[k] = v.filter((x) => typeof x === 'string' && !conferirTexto(x, conjunto).trechos.length);
    } else {
      limpo[k] = v;
    }
  }
  return limpo;
}
