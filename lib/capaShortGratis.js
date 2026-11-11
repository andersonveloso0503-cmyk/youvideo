// Capa GRÁTIS dos Shorts de games e política (sem IA de imagem): a foto real e livre do assunto que já está no vídeo
// (política: a pessoa principal / o lugar; games: a arte oficial do jogo) + 2 a 5 palavras GIGANTES no alto,
// no mesmo estilo das capas da IA (branco + amarelo #FFD400, contorno preto grosso). O texto é desenhado aqui,
// então nunca sai com erro de português. Usada quando o Gemini falha (ex.: créditos acabaram) e como opção no ✅ Aprovar.
import fs from 'fs';
import path from 'path';
import { put } from '@vercel/blob';

const W = 1080;
const H = 1920;
const FONTE = path.join(process.cwd(), 'lib', 'fontes', 'Montserrat_800ExtraBold.ttf');

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function baixarImagem(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`imagem ${r.status}`);
  const mime = (r.headers.get('content-type') || '').split(';')[0].trim();
  const buf = Buffer.from(await r.arrayBuffer());
  // resvg lê JPEG e PNG; descobre pelo começo do arquivo (alguns sites mandam content-type errado)
  const tipo = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : mime;
  if (!/^image\/(jpeg|png)$/.test(tipo)) throw new Error(`formato ${tipo || 'desconhecido'}`);
  if (buf.length > 12e6) throw new Error('imagem grande demais');
  // largura x altura (para saber se é deitada)
  let w = 0;
  let h = 0;
  if (tipo === 'image/png') {
    w = buf.readUInt32BE(16);
    h = buf.readUInt32BE(20);
  } else {
    for (let i = 2; i < buf.length - 9; ) {
      if (buf[i] !== 0xff) break;
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
        h = buf.readUInt16BE(i + 5);
        w = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
  }
  return { href: `data:${tipo};base64,${buf.toString('base64')}`, w, h };
}

// Montserrat ExtraBold em caixa alta: ~0,76 do tamanho por letra (largo; acentos e W/M pesam) — folga para nunca cortar
const tamanhoPara = (t, max) => Math.round(Math.min(max, (W * 0.88) / Math.max(3, [...t].length * 0.76)));

/** Quebra a manchete em 2 ou 3 linhas — a divisão que deixa a MENOR linha o maior possível. A 1ª é branca, o resto amarelo. */
function linhas(manchete) {
  const p = manchete.split(' ').filter(Boolean);
  if (p.length < 2) return [p.join(' ')];
  const opcoes = [];
  for (let a = 1; a < p.length; a++) {
    opcoes.push([p.slice(0, a), p.slice(a)]);
    for (let b = a + 1; b < p.length; b++) opcoes.push([p.slice(0, a), p.slice(a, b), p.slice(b)]);
  }
  let melhor = null;
  let nota = -1;
  for (const o of opcoes) {
    const ls = o.map((x) => x.join(' '));
    const n = Math.min(...ls.map((l) => tamanhoPara(l, 230))) - (ls.length === 3 ? 12 : 0); // empate: 2 linhas
    if (n > nota) (nota = n), (melhor = ls);
  }
  return melhor;
}

export function svgCapa({ manchete, img, tipo }) {
  const ls = linhas(manchete);
  const topo = 220;
  let y = topo;
  const partes = ls.map((t, k) => {
    const tam = tamanhoPara(t, k === 0 && ls.length > 1 ? 190 : 230);
    y += (k ? Math.round(tam * 0.14) : 0) + tam;
    return { t, tam, y, cor: k === 0 && ls.length > 1 ? '#ffffff' : '#FFD400' };
  });
  const yBaixo = y;
  const texto = ({ t, y: yy, tam, cor }) =>
    `<text x="${W / 2}" y="${yy}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="${tam}" fill="${cor}" stroke="#000" stroke-width="${Math.round(tam / 6.5)}" stroke-linejoin="round" paint-order="stroke" filter="url(#sombra)">${esc(t)}</text>`;
  const deitada = img.w && img.h && img.w > img.h * 1.15;
  // Foto deitada (cena do jogo, foto de jornal): ela inteira e grande num quadro, com ela mesma desfocada atrás
  const qW = W - 80;
  const qH = deitada ? Math.min(Math.round((qW * img.h) / img.w), 900) : 0;
  const qY = Math.round(yBaixo + 120);
  const foto = deitada
    ? `<image href="${img.href}" x="-200" y="-200" width="${W + 400}" height="${H + 400}" preserveAspectRatio="xMidYMid slice" filter="url(#borra)"/>
       <rect width="${W}" height="${H}" fill="#000" opacity=".35"/>
       <rect x="34" y="${qY - 6}" width="${qW + 12}" height="${qH + 12}" rx="30" fill="#fff"/>
       <clipPath id="q"><rect x="40" y="${qY}" width="${qW}" height="${qH}" rx="26"/></clipPath>
       <image href="${img.href}" x="40" y="${qY}" width="${qW}" height="${qH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#q)"/>`
    : `<image href="${img.href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMid${tipo === 'politica' ? 'YMin' : 'YMid'} slice"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="borra" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="sombra" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity=".7"/></filter>
    <linearGradient id="escuro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".82"/><stop offset=".38" stop-color="#000" stop-opacity=".35"/><stop offset=".55" stop-color="#000" stop-opacity="0"/>
      <stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b0f1a"/>
  ${foto}
  <rect width="${W}" height="${H}" fill="url(#escuro)"/>
  ${partes.map(texto).join('\n  ')}
</svg>`;
}

/** Faz a capa grátis e devolve a URL pública. imagens: lista de URLs candidatas (a 1ª que abrir é usada). */
export async function capaShortGratis({ tipo, texto, imagens = [] }) {
  const manchete = String(texto || '').replace(/["“”#]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40);
  if (!manchete) throw new Error('Sem texto para a capa.');
  let img = null;
  let erro = 'sem imagem do assunto';
  // Não repete o fundo das últimas capas (3 capas seguidas com a mesma foto de console = parece tudo igual)
  const { getDb } = await import('./firebase-admin');
  const refUsadas = getDb().collection('youvideo_config').doc('capas_gratis_usadas');
  const usadas = (await refUsadas.get().catch(() => null))?.data()?.urls || [];
  const unicas = [...new Set(imagens.filter(Boolean))];
  const ordem = [...unicas.filter((u) => !usadas.includes(u)), ...unicas.filter((u) => usadas.includes(u))];
  let escolhida = '';
  for (const u of ordem) {
    try {
      img = await baixarImagem(u);
      escolhida = u;
      break;
    } catch (e) {
      erro = e.message;
    }
  }
  if (!img) throw new Error(`Capa grátis: ${erro}`);
  await refUsadas.set({ urls: [escolhida, ...usadas.filter((u) => u !== escolhida)].slice(0, 40) }).catch(() => {});
  const { Resvg } = await import('@resvg/resvg-js');
  const r = new Resvg(svgCapa({ manchete, img, tipo }), {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: [FONTE], loadSystemFonts: false, defaultFontFamily: 'Montserrat' },
  }).render();
  // JPEG (o YouTube aceita capa de até 2 MB; PNG de foto passaria disso)
  const jpeg = (await import('jpeg-js')).default || (await import('jpeg-js'));
  const jpg = jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, 86).data;
  const b = await put(`thumbnails/short-${tipo}-gratis-${Date.now()}.jpg`, jpg, {
    access: 'public',
    contentType: 'image/jpeg',
    token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  return b.url;
}

/**
 * Fotos reais do assunto, na ordem de preferência. Games: a ARTE OFICIAL do jogo da notícia (o que mais aparece no vídeo),
 * depois as imagens oficiais usadas no vídeo; foto genérica (console, controle) só no fim. Política: a pessoa principal,
 * senão o lugar/objeto.
 */
export async function imagensDaCapa(item) {
  const arquivos = item.arquivos || [];
  const primeira = arquivos.filter((x) => x.imageUrl).map((x) => x.imageUrl);
  if (item.games) {
    const conta = {};
    for (const x of arquivos) if (x.jogo) conta[x.jogo] = (conta[x.jogo] || 0) + 1;
    for (const c of item.roteiro?.cenas || []) {
      const b = String(c.busca || '');
      if (/^jogo:/i.test(b)) {
        const n = b.replace(/^jogo:\s*/i, '').split('|')[0].trim();
        if (n) conta[n] = (conta[n] || 0) + 2;
      }
    }
    const jogos = Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 2);
    const artes = [];
    try {
      const { arteDoJogo } = await import('./games');
      for (const j of jogos) {
        const a = await arteDoJogo(j, { vertical: true }).catch(() => null);
        if (a) artes.push(a);
      }
    } catch {
      /* sem arte: segue com as imagens do vídeo */
    }
    const oficiais = arquivos.filter((x) => x.jogo && x.imageUrl).map((x) => x.imageUrl);
    return [...artes, ...oficiais, item.capaUrl, ...primeira].filter(Boolean).slice(0, 10);
  }
  const daCena = (item.roteiro?.cenas || []).map((c) => c.ilustracao?.fotoUrl || c.ilustracao?.fotos?.find((f) => f?.url)?.url).filter(Boolean);
  const pessoa = arquivos.filter((x) => /^wp/.test(String(x.midiaId || '')) && x.imageUrl).map((x) => x.imageUrl);
  const lugar = arquivos.filter((x) => /^wc/.test(String(x.midiaId || '')) && x.imageUrl).map((x) => x.imageUrl);
  return [...daCena, ...pessoa, ...lugar, ...primeira].slice(0, 10);
}

export const _fonte = () => fs.existsSync(FONTE);
