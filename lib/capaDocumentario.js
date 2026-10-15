/**
 * Capa dos documentários (1280×720) montada aqui mesmo, sem serviço pago:
 * pintura/foto de fundo + título em letras medievais (Cinzel) + subtítulo + moeda do canal.
 * Usa o mesmo motor de imagem do Next (next/og) e devolve um JPEG pronto para o YouTube (< 2 MB).
 */
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { CINZEL_700, CINZEL_900 } from './fonteCinzel';

const LARG = 1280;
const ALT = 720;

const fonteBuf = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/**
 * Realça a pintura antes de montar a capa: pinturas do Flux costumam sair escuras demais para
 * miniatura do YouTube. Clareia até um brilho médio bom, aumenta a saturação e o contraste.
 */
export function realcar(buf) {
  let img;
  try {
    img = buf[0] === 0x89 ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
  } catch {
    return buf;
  }
  const d = img.data;
  let soma = 0;
  for (let i = 0; i < d.length; i += 16) soma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const media = soma / (d.length / 16) / 255;
  const ganho = Math.min(1.7, Math.max(1, 0.42 / Math.max(0.05, media)));
  const SAT = 1.3;
  const CONTRASTE = 1.1;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    // clareia mais as sombras do que as luzes (não estoura o céu nem o rosto)
    r = 1 - Math.pow(1 - r, ganho); g = 1 - Math.pow(1 - g, ganho); b = 1 - Math.pow(1 - b, ganho);
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * SAT; g = l + (g - l) * SAT; b = l + (b - l) * SAT;
    r = (r - 0.5) * CONTRASTE + 0.5; g = (g - 0.5) * CONTRASTE + 0.5; b = (b - 0.5) * CONTRASTE + 0.5;
    d[i] = Math.max(0, Math.min(255, r * 255));
    d[i + 1] = Math.max(0, Math.min(255, g * 255));
    d[i + 2] = Math.max(0, Math.min(255, b * 255));
  }
  return Buffer.from(jpeg.encode({ data: d, width: img.width, height: img.height }, 92).data);
}

async function comoDataUri(url) {
  let buf;
  if (url.startsWith('data:')) buf = Buffer.from(url.split(',')[1], 'base64');
  else {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fundo da capa indisponível (${r.status})`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  return `data:image/jpeg;base64,${realcar(buf).toString('base64')}`;
}

// Contorno escuro + brilho dourado suave: lê bem em cima de qualquer pintura
const SOMBRA_TITULO =
  '0 5px 0 #2a1a08, 0 -2px 0 #2a1a08, 3px 0 0 #2a1a08, -3px 0 0 #2a1a08, 5px 8px 0 #140b03, 0 0 34px rgba(0,0,0,0.9)';
const SOMBRA_PEQUENA = '0 2px 0 #1a0f04, 0 0 14px rgba(0,0,0,0.95)';

function layout({ fundo, palavras, tam, subtitulo, chamada }) {
  const camada = (style, ...filhos) => h('div', { style: { position: 'absolute', display: 'flex', ...style } }, ...filhos);
  return h(
    'div',
    { style: { width: LARG, height: ALT, display: 'flex', position: 'relative', background: '#120b04', fontFamily: 'Cinzel' } },
    // Fundo
    h('img', { src: fundo, width: LARG, height: ALT, style: { position: 'absolute', top: 0, left: 0, width: LARG, height: ALT, objectFit: 'cover' } }),
    // Leve calor e contraste por cima da pintura
    camada({ top: 0, left: 0, width: LARG, height: ALT, background: 'linear-gradient(180deg, rgba(255,170,60,0.06) 0%, rgba(0,0,0,0) 50%, rgba(10,6,2,0.3) 100%)' }),
    // Lado do título mais escuro
    camada({ top: 0, left: 0, width: LARG, height: ALT, background: 'linear-gradient(90deg, rgba(16,10,3,0.75) 0%, rgba(16,10,3,0.45) 36%, rgba(16,10,3,0) 58%)' }),
    // Vinheta nas bordas
    camada({ top: 0, left: 0, width: LARG, height: ALT, background: 'radial-gradient(ellipse at 60% 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.38) 100%)' }),
    // Moldura fina dourada
    camada({ top: 14, left: 14, width: LARG - 28, height: ALT - 28, border: '2px solid rgba(201,162,75,0.55)', borderRadius: 4 }),
    // Bloco de texto
    camada(
      { top: 0, left: 58, width: 660, height: ALT, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
      chamada
        ? h(
            'div',
            { style: { display: 'flex', fontSize: 24, fontWeight: 700, color: '#E8C26A', letterSpacing: 6, marginBottom: 14, textShadow: SOMBRA_PEQUENA } },
            chamada
          )
        : null,
      ...palavras.map((p) =>
        h(
          'div',
          { style: { display: 'flex', fontSize: tam, fontWeight: 900, color: '#F5E6BE', lineHeight: 1, letterSpacing: 1, textShadow: SOMBRA_TITULO } },
          p
        )
      ),
      subtitulo
        ? h(
            'div',
            { style: { display: 'flex', alignItems: 'center', marginTop: 22 } },
            h('div', { style: { display: 'flex', width: 46, height: 2, background: '#C9A24B', marginRight: 16 } }),
            h('div', { style: { display: 'flex', fontSize: 30, fontWeight: 700, color: '#F5E6BE', letterSpacing: 3, textShadow: SOMBRA_PEQUENA } }, subtitulo),
            h('div', { style: { display: 'flex', width: 46, height: 2, background: '#C9A24B', marginLeft: 16 } })
          )
        : null
    ),
    // Moeda do canal (N de Noites)
    camada(
      {
        bottom: 34,
        left: 34,
        width: 82,
        height: 82,
        borderRadius: 41,
        background: '#2a1d0e',
        border: '5px solid #C9A24B',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.7)',
      },
      h('div', { style: { display: 'flex', fontSize: 46, fontWeight: 900, color: '#E8C26A', marginTop: -4 } }, 'N')
    )
  );
}

/**
 * Monta a capa e devolve um Buffer JPEG.
 * fundoUrl: pintura ou foto; texto: nome do tema (ex.: "Os Vikings"); subtitulo opcional.
 */
export async function montarCapa({ fundoUrl, texto, subtitulo = '', chamada = 'HISTÓRIA PARA DORMIR' }) {
  const fundo = await comoDataUri(fundoUrl);
  const palavras = String(texto).toUpperCase().split(/\s+/).filter(Boolean);
  // Cinzel é larga: o tamanho depende da palavra mais comprida, para nenhuma ser cortada
  const maior = Math.max(...palavras.map((w) => w.length), 1);
  let tam = Math.round(Math.min(150, 620 / (maior * 0.72)));
  // Títulos de 4+ palavras: diminui para caber na altura
  if (palavras.length >= 4) tam = Math.min(tam, 110);
  // Junta palavras curtas na mesma linha ("OS VIKINGS", "DE OURO") para o título ficar mais forte
  const linhas = [];
  for (const p of palavras) {
    const ult = linhas[linhas.length - 1];
    if (ult && (ult.length <= 3 || p.length <= 2) && (ult + ' ' + p).length * tam * 0.72 <= 640) linhas[linhas.length - 1] = `${ult} ${p}`;
    else linhas.push(p);
  }
  // Três linhas ou mais: menor, para não encostar na moeda
  if (linhas.length >= 3) tam = Math.min(tam, 108);
  const resp = new ImageResponse(layout({ fundo, palavras: linhas, tam, subtitulo: String(subtitulo || '').toUpperCase(), chamada }), {
    width: LARG,
    height: ALT,
    fonts: [
      { name: 'Cinzel', data: fonteBuf(CINZEL_700), weight: 700, style: 'normal' },
      { name: 'Cinzel', data: fonteBuf(CINZEL_900), weight: 900, style: 'normal' },
    ],
  });
  const png = Buffer.from(await resp.arrayBuffer());
  const { width, height, data } = PNG.sync.read(png);
  return jpeg.encode({ data, width, height }, 90).data;
}
