/**
 * Capa de coletânea musical montada aqui mesmo, sem IA (quando o Gemini não consegue: sem crédito, fora do ar).
 * Fundo em degradê com brilho + título grande dourado + faixa com o subtítulo. Devolve um JPEG 1280×720.
 */
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { LILITA } from './fonteLilita';

const LARG = 1280;
const ALT = 720;
// Paletas por clima do estilo: sertanejo = pôr do sol; pagode = noite roxa; louvor = céu azul
function paleta(estilo) {
  const e = String(estilo || '').toLowerCase();
  if (/sertanej|modão|modao|raiz|caipira|country/.test(e)) return ['#3b1405', '#a3410f', '#f2a33a'];
  if (/pagode|samba/.test(e)) return ['#1a0b3a', '#5b1f8f', '#e0569b'];
  if (/rock|metal|trap|rap/.test(e)) return ['#0b0b12', '#2a1446', '#c7372f'];
  return ['#06122e', '#1d3f8f', '#7fb4ff'];
}

export async function montarCapaMusica({ titulo, subtitulo, estilo }) {
  const [c1, c2, c3] = paleta(estilo);
  const palavras = String(titulo || '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const linhas = [];
  for (const p of palavras) {
    const ult = linhas[linhas.length - 1];
    if (ult && (ult.join(' ') + ' ' + p).length <= 12) ult.push(p);
    else linhas.push([p]);
  }
  const maior = Math.max(...linhas.map((l) => l.join(' ').length), 1);
  const tam = Math.max(80, Math.min(170, Math.floor(760 / (maior * 0.6))));
  const sombra = '0 6px 0 #5a3a00, 0 10px 18px rgba(0,0,0,0.6), 0 0 40px rgba(255,200,80,0.45)';
  const arvore = h(
    'div',
    { style: { width: LARG, height: ALT, display: 'flex', position: 'relative', fontFamily: 'Lilita', background: `linear-gradient(135deg, ${c1} 0%, ${c2} 55%, ${c3} 100%)` } },
    // brilho de luz atrás do título
    h('div', { style: { position: 'absolute', display: 'flex', top: -160, left: -120, width: 900, height: 900, borderRadius: 450, background: 'radial-gradient(circle, rgba(255,230,160,0.35) 0%, rgba(255,230,160,0) 65%)' } }),
    h('div', { style: { position: 'absolute', display: 'flex', bottom: -200, right: -100, width: 700, height: 700, borderRadius: 350, background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 60%)' } }),
    h(
      'div',
      { style: { position: 'absolute', display: 'flex', top: 0, left: 60, width: 900, height: ALT - 80, flexDirection: 'column', justifyContent: 'center' } },
      ...linhas.map((l) => h('div', { style: { display: 'flex', fontSize: tam, lineHeight: 1.0, color: '#FFD45C', textShadow: sombra } }, l.join(' '))),
      subtitulo
        ? h(
            'div',
            { style: { display: 'flex', marginTop: 26 } },
            h('div', { style: { display: 'flex', background: '#c4142f', color: '#fff', fontSize: 46, padding: '10px 28px', borderRadius: 10, boxShadow: '0 6px 0 #6d0a19' } }, String(subtitulo).toUpperCase())
          )
        : null
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
