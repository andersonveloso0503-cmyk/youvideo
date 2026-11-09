/**
 * Capa do canal "Brasil Inacreditável" (1280×720), montada aqui mesmo (next/og), sem serviço pago:
 * foto real do caso à direita, lado esquerdo escuro com o texto curto e gigante (até 4 palavras) em branco,
 * a última linha em amarelo, etiqueta verde com lugar e ano e o selo "BI" no canto. Mesmas cores do banner.
 */
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { LILITA } from './fonteLilita';
import { realcar } from './capaDocumentario';

const LARG = 1280;
const ALT = 720;
const FUNDO = '#0E1116';
const AMARELO = '#FFD23F';
const VERDE = '#2BB673';

const fonteBuf = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

async function comoDataUri(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fundo da capa indisponível (${r.status})`);
  return `data:image/jpeg;base64,${realcar(Buffer.from(await r.arrayBuffer())).toString('base64')}`;
}

const SOMBRA = '0 5px 0 #05070a, 0 -2px 0 #05070a, 3px 0 0 #05070a, -3px 0 0 #05070a, 0 0 28px rgba(0,0,0,0.9)';

function layout({ fundo, linhas, tam, subtitulo }) {
  const camada = (style, ...filhos) => h('div', { style: { position: 'absolute', display: 'flex', ...style } }, ...filhos);
  return h(
    'div',
    { style: { width: LARG, height: ALT, display: 'flex', position: 'relative', background: FUNDO, fontFamily: 'Lilita' } },
    h('img', { src: fundo, width: LARG, height: ALT, style: { position: 'absolute', top: 0, left: 0, width: LARG, height: ALT, objectFit: 'cover' } }),
    camada({ top: 0, left: 0, width: LARG, height: ALT, background: 'linear-gradient(90deg, rgba(14,17,22,0.94) 0%, rgba(14,17,22,0.7) 42%, rgba(14,17,22,0) 70%)' }),
    // Faixa verde-amarela embaixo (a mesma do banner)
    camada({ left: 0, bottom: 0, width: LARG, height: 12, background: `linear-gradient(90deg, ${VERDE} 0%, ${VERDE} 33%, ${AMARELO} 33%, ${AMARELO} 66%, ${VERDE} 66%)` }),
    camada(
      { top: 0, left: 56, width: 720, height: ALT, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' },
      subtitulo
        ? h('div', { style: { display: 'flex', marginBottom: 18, padding: '6px 18px 8px', background: VERDE, color: FUNDO, fontSize: 36, borderRadius: 10 } }, subtitulo)
        : null,
      ...linhas.map((l, i) =>
        h('div', { style: { display: 'flex', fontSize: tam, color: i === linhas.length - 1 && linhas.length > 1 ? AMARELO : '#ffffff', lineHeight: 1.0, textShadow: SOMBRA } }, l)
      )
    ),
    // Selo do canal
    camada(
      { bottom: 34, right: 30, width: 92, height: 92, borderRadius: 46, border: `6px solid ${VERDE}`, background: 'rgba(14,17,22,0.9)', alignItems: 'center', justifyContent: 'center' },
      h('div', { style: { display: 'flex', fontSize: 44, color: '#ffffff' } }, 'B'),
      h('div', { style: { display: 'flex', fontSize: 44, color: AMARELO } }, 'I')
    )
  );
}

/** Monta a capa e devolve um Buffer JPEG. texto: frase curta em caixa alta (ex.: "A CIDADE QUE O MAR ENGOLE"). */
export async function montarCapaBrasil({ fundoUrl, texto, subtitulo = '' }) {
  const fundo = await comoDataUri(fundoUrl);
  const palavras = String(texto).toUpperCase().split(/\s+/).filter(Boolean);
  const linhas = [];
  for (const p of palavras) {
    const ult = linhas[linhas.length - 1];
    if (ult && (ult + ' ' + p).length <= 12) linhas[linhas.length - 1] = `${ult} ${p}`;
    else linhas.push(p);
  }
  const maior = Math.max(...linhas.map((l) => l.length), 1);
  let tam = Math.round(Math.min(160, 700 / (maior * 0.56)));
  if (linhas.length >= 3) tam = Math.min(tam, 124);
  if (linhas.length >= 4) tam = Math.min(tam, 100);
  const resp = new ImageResponse(layout({ fundo, linhas, tam, subtitulo: String(subtitulo || '').toUpperCase() }), {
    width: LARG,
    height: ALT,
    fonts: [{ name: 'Lilita', data: fonteBuf(LILITA), weight: 400, style: 'normal' }],
  });
  const png = Buffer.from(await resp.arrayBuffer());
  const { width, height, data } = PNG.sync.read(png);
  return jpeg.encode({ data, width, height }, 90).data;
}

/** Capa pronta no Blob (URL). Sem texto ou se der erro, devolve a própria foto. */
export async function thumbBrasil({ fotoUrl, texto, subtitulo = '' }) {
  if (!fotoUrl) return null;
  if (!texto) return fotoUrl;
  try {
    const jpg = await montarCapaBrasil({ fundoUrl: fotoUrl, texto, subtitulo });
    const { put } = await import('@vercel/blob');
    const blob = await put(`brasil-capa-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
    return blob.url;
  } catch {
    return fotoUrl;
  }
}
