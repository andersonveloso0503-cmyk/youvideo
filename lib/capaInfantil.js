/**
 * Capa do desenho infantil montada aqui mesmo, sem IA: imagem do episódio (Flux) + título grande
 * em letras gordinhas coloridas (Lilita One), cada palavra de uma cor, com contorno branco e escuro.
 * Usada quando o Gemini não consegue fazer a capa com o título escrito (ex.: sem crédito).
 */
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { LILITA } from './fonteLilita';
import { realcar } from './capaDocumentario';

const LARG = 1280;
const ALT = 720;
const CORES = ['#FFE14D', '#FF5FA2', '#4FC3FF', '#7CFF6B', '#FFA94D', '#C792FF'];

// Contorno grosso (branco) + sombra escura: lê bem em cima de qualquer cenário colorido
const contorno = (w, cor) =>
  [
    [w, 0], [-w, 0], [0, w], [0, -w], [w, w], [-w, -w], [w, -w], [-w, w],
    [w * 0.7, w], [-w * 0.7, w], [w, w * 0.7], [-w, w * 0.7],
  ].map(([x, y]) => `${x}px ${y}px 0 ${cor}`).join(', ');
const SOMBRA = `${contorno(6, '#ffffff')}, ${contorno(10, '#3a1a6b')}, 0 14px 0 #2a0f55, 0 0 40px rgba(0,0,0,0.5)`;

function linhas(texto) {
  const palavras = String(texto || '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  // até 3 linhas curtas (letra maior), cada uma com no máximo ~8 letras
  const out = [];
  for (const p of palavras) {
    const ult = out[out.length - 1];
    if (ult && ((ult.join(' ') + ' ' + p).length <= 8 || (p.length <= 2 && (ult.join(' ') + ' ' + p).length <= 11))) ult.push(p);
    else out.push([p]);
  }
  return out.slice(0, 3);
}

async function comoDataUri(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`imagem da capa indisponível (${r.status})`);
  return `data:image/jpeg;base64,${realcar(Buffer.from(await r.arrayBuffer())).toString('base64')}`;
}

/** Devolve um JPEG 1280×720 (Buffer). `ladoTexto`: 'esquerda' (padrão) ou 'direita'. */
export async function montarCapaInfantil({ fundoUrl, texto, ladoTexto = 'esquerda' }) {
  const fundo = await comoDataUri(fundoUrl);
  const ls = linhas(texto);
  const maior = Math.max(...ls.map((l) => l.join(' ').length), 1);
  const tam = Math.max(90, Math.min(190, Math.floor(700 / (maior * 0.6))));
  let k = 0;
  const camada = (style, ...filhos) => h('div', { style: { position: 'absolute', display: 'flex', ...style } }, ...filhos);
  const arvore = h(
    'div',
    { style: { width: LARG, height: ALT, display: 'flex', position: 'relative', fontFamily: 'Lilita' } },
    h('img', { src: fundo, width: LARG, height: ALT, style: { position: 'absolute', top: 0, left: 0, width: LARG, height: ALT, objectFit: 'cover' } }),
    // brilho suave atrás do texto
    camada({
      top: 0, left: 0, width: LARG, height: ALT,
      background: ladoTexto === 'direita'
        ? 'radial-gradient(ellipse at 78% 50%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 55%)'
        : 'radial-gradient(ellipse at 24% 50%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 55%)',
    }),
    camada(
      {
        top: 0, height: ALT - 60, width: 700,
        ...(ladoTexto === 'direita' ? { right: 30 } : { left: 30 }),
        flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        transform: 'rotate(-4deg)',
      },
      ...ls.map((l) =>
        h(
          'div',
          { style: { display: 'flex', lineHeight: 1.02 } },
          ...l.map((p, j) =>
            h('div', { style: { display: 'flex', fontSize: tam, color: CORES[k++ % CORES.length], textShadow: SOMBRA, marginLeft: j ? tam * 0.25 : 0 } }, p)
          )
        )
      )
    )
  );
  const b = Buffer.from(LILITA, 'base64');
  const img = new ImageResponse(arvore, {
    width: LARG,
    height: ALT,
    fonts: [{ name: 'Lilita', data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), weight: 400, style: 'normal' }],
  });
  const png = PNG.sync.read(Buffer.from(await img.arrayBuffer()));
  return Buffer.from(jpeg.encode({ data: png.data, width: png.width, height: png.height }, 90).data);
}
