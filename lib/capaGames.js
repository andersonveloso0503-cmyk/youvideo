/**
 * Capa do canal de games "Próxima Fase" (1280×720), montada aqui mesmo (next/og), sem serviço pago:
 * imagem oficial do jogo de fundo + texto curto e gigante (até 4 palavras) em branco e verde neon,
 * faixa com o subtítulo e o selo "PF »" do canal no canto. Mesmas cores do banner e do logo.
 */
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { LILITA } from './fonteLilita';
import { realcar } from './capaDocumentario';

const LARG = 1280;
const ALT = 720;
const ROXO = '#10061f';
const NEON = '#39ff88';

const fonteBuf = (b64) => {
  const b = Buffer.from(b64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

async function comoDataUri(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fundo da capa indisponível (${r.status})`);
  return `data:image/jpeg;base64,${realcar(Buffer.from(await r.arrayBuffer())).toString('base64')}`;
}

const SOMBRA = '0 6px 0 #10061f, 0 -3px 0 #10061f, 4px 0 0 #10061f, -4px 0 0 #10061f, 6px 10px 0 #05020a, 0 0 30px rgba(0,0,0,0.85)';

function layout({ fundo, linhas, tam, subtitulo }) {
  const camada = (style, ...filhos) => h('div', { style: { position: 'absolute', display: 'flex', ...style } }, ...filhos);
  return h(
    'div',
    { style: { width: LARG, height: ALT, display: 'flex', position: 'relative', background: ROXO, fontFamily: 'Lilita' } },
    h('img', { src: fundo, width: LARG, height: ALT, style: { position: 'absolute', top: 0, left: 0, width: LARG, height: ALT, objectFit: 'cover' } }),
    // Lado do texto mais escuro, puxando para o roxo do canal
    camada({ top: 0, left: 0, width: LARG, height: ALT, background: 'linear-gradient(90deg, rgba(16,6,31,0.88) 0%, rgba(16,6,31,0.55) 40%, rgba(16,6,31,0) 66%)' }),
    camada({ top: 0, left: 0, width: LARG, height: ALT, background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(16,6,31,0.55) 100%)' }),
    // Texto: a última linha em verde neon (é a que "chama")
    camada(
      { top: 0, left: 54, width: 720, height: ALT, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' },
      ...linhas.map((l, i) =>
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontSize: tam,
              color: i === linhas.length - 1 && linhas.length > 1 ? NEON : '#ffffff',
              lineHeight: 0.98,
              textShadow: SOMBRA,
            },
          },
          l
        )
      ),
      subtitulo
        ? h(
            'div',
            {
              style: {
                display: 'flex',
                marginTop: 22,
                padding: '8px 22px 10px',
                background: NEON,
                color: ROXO,
                fontSize: 40,
                borderRadius: 12,
                boxShadow: '0 6px 0 #10061f',
              },
            },
            subtitulo
          )
        : null
    ),
    // Selo do canal
    camada(
      {
        bottom: 30,
        right: 30,
        padding: '8px 18px 10px',
        background: 'rgba(16,6,31,0.85)',
        border: `4px solid ${NEON}`,
        borderRadius: 16,
        alignItems: 'center',
      },
      h('div', { style: { display: 'flex', fontSize: 40, color: '#ffffff' } }, 'PF'),
      h('div', { style: { display: 'flex', fontSize: 40, color: NEON, marginLeft: 8 } }, '»')
    )
  );
}

/** Monta a capa e devolve um Buffer JPEG. texto: frase curta (ex.: "GTA 6 TUDO QUE SABEMOS"). */
export async function montarCapaGames({ fundoUrl, texto, subtitulo = '' }) {
  const fundo = await comoDataUri(fundoUrl);
  const palavras = String(texto).toUpperCase().split(/\s+/).filter(Boolean);
  // Junta palavras curtas na mesma linha ("GTA 6", "O QUE") até ~11 letras por linha
  const linhas = [];
  for (const p of palavras) {
    const ult = linhas[linhas.length - 1];
    if (ult && (ult + ' ' + p).length <= 11) linhas[linhas.length - 1] = `${ult} ${p}`;
    else linhas.push(p);
  }
  const maior = Math.max(...linhas.map((l) => l.length), 1);
  let tam = Math.round(Math.min(170, 700 / (maior * 0.56)));
  if (linhas.length >= 3) tam = Math.min(tam, 130);
  if (linhas.length >= 4) tam = Math.min(tam, 104);
  const resp = new ImageResponse(layout({ fundo, linhas, tam, subtitulo: String(subtitulo || '').toUpperCase() }), {
    width: LARG,
    height: ALT,
    fonts: [{ name: 'Lilita', data: fonteBuf(LILITA), weight: 400, style: 'normal' }],
  });
  const png = Buffer.from(await resp.arrayBuffer());
  const { width, height, data } = PNG.sync.read(png);
  return jpeg.encode({ data, width, height }, 90).data;
}

/** Capa pronta no Blob (URL). Sem texto ou se der erro, devolve a própria imagem do jogo. */
export async function thumbGames({ fotoUrl, texto, subtitulo = '' }) {
  if (!fotoUrl) return null;
  if (!texto) return fotoUrl;
  try {
    const jpg = await montarCapaGames({ fundoUrl: fotoUrl, texto, subtitulo });
    const { put } = await import('@vercel/blob');
    const blob = await put(`games-capa-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
    return blob.url;
  } catch {
    return fotoUrl;
  }
}
