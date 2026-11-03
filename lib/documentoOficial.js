/**
 * Documentos citados nas notícias de política (PEC, PL, PLP, MP, PDL...): mostra o DOCUMENTO DE VERDADE.
 *  1) procura a proposição na Câmara (dados abertos) e depois no Senado e pega o PDF do inteiro teor;
 *  2) desenha a 1ª página do PDF como imagem (mupdf) e guarda no Blob;
 *  3) sem número ou sem PDF: um cartão com o nome do documento (nunca imita papel oficial).
 * Texto de lei e de proposição é público (Lei 9.610, art. 8º): pode mostrar, com a fonte na descrição.
 */
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';

/** "PEC 45/2019", "PL nº 2.338, de 2023", "MP 1303/25" -> { sigla, numero, ano } */
export function lerReferencia(ref) {
  const t = String(ref || '').toUpperCase().replace(/N[ºO°]\.?\s*/g, ' ').replace(/\./g, '');
  const m = t.match(/\b(PEC|PLP|PLN|PDL|PL|MPV|MP|PLS|PLC|PRS|PDS)\s*(\d{1,5})\s*(?:\/|,?\s*DE\s*)\s*(\d{2,4})\b/);
  if (!m) return null;
  let ano = Number(m[3]);
  if (ano < 100) ano += ano > 50 ? 1900 : 2000;
  return { sigla: m[1] === 'MP' ? 'MPV' : m[1], numero: Number(m[2]), ano };
}

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

/** Procura no JSON (de qualquer formato) o primeiro valor de uma chave. */
function acharChave(obj, chave, teste = () => true, prof = 0) {
  if (!obj || typeof obj !== 'object' || prof > 8) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (k === chave && v != null && teste(v)) return v;
    const achado = acharChave(v, chave, teste, prof + 1);
    if (achado != null) return achado;
  }
  return null;
}

async function pdfDaCamara({ sigla, numero, ano }) {
  const lista = await json(`https://dadosabertos.camara.leg.br/api/v2/proposicoes?siglaTipo=${sigla}&numero=${numero}&ano=${ano}&itens=5`);
  const id = lista?.dados?.[0]?.id;
  if (!id) return null;
  const d = await json(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${id}`);
  const url = d?.dados?.urlInteiroTeor;
  return url ? { url, fonte: 'Câmara dos Deputados', ementa: d?.dados?.ementa || '' } : null;
}

async function pdfDoSenado({ sigla, numero, ano }) {
  const lista = await json(`https://legis.senado.leg.br/dadosabertos/materia/pesquisa/lista?sigla=${sigla}&numero=${numero}&ano=${ano}`);
  const codigo = acharChave(lista, 'Codigo') || acharChave(lista, 'CodigoMateria');
  if (!codigo) return null;
  const textos = await json(`https://legis.senado.leg.br/dadosabertos/materia/textos/${codigo}`);
  const url = acharChave(textos, 'UrlTexto', (v) => /^https?:/i.test(String(v)));
  const ementa = acharChave(lista, 'Ementa') || acharChave(lista, 'EmentaMateria') || '';
  return url ? { url: String(url), fonte: 'Senado Federal', ementa: String(ementa) } : null;
}

/** 1ª página do PDF como JPEG em pé (mupdf, WASM). */
async function primeiraPagina(urlPdf) {
  const r = await fetch(urlPdf, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.slice(0, 4).toString() !== '%PDF') return null;
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const pagina = doc.loadPage(0);
  const [x0, , x1] = pagina.getBounds();
  const escala = 1200 / Math.max(1, x1 - x0);
  const pix = pagina.toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());
  const { width, height, data } = PNG.sync.read(png);
  return Buffer.from(jpeg.encode({ data, width, height }, 88).data);
}

async function guardar(jpg, nome) {
  const { put } = await import('@vercel/blob');
  const blob = await put(`doc-${nome}-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
  return blob.url;
}

/** Cartão (1080×1350) com o nome do documento: claro que é um destaque do canal, não o papel oficial. */
async function cartao(titulo, ref) {
  const resp = new ImageResponse(
    h(
      'div',
      { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#0f1b33,#1d3a66)', padding: 70 } },
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', width: '100%', background: '#f6f3ea', borderRadius: 28, padding: '70px 64px', boxShadow: '0 20px 60px rgba(0,0,0,.45)' } },
        h('div', { style: { fontSize: 44, color: '#1d3a66', fontWeight: 700, letterSpacing: 4 } }, 'DOCUMENTO EM DISCUSSÃO'),
        h('div', { style: { height: 6, width: 160, background: '#e0a526', margin: '30px 0 40px' } }),
        ref ? h('div', { style: { fontSize: 92, color: '#111', fontWeight: 800 } }, ref) : null,
        h('div', { style: { fontSize: ref ? 54 : 76, color: '#222', marginTop: 24, lineHeight: 1.25 } }, String(titulo || '').slice(0, 140)),
        h('div', { style: { fontSize: 32, color: '#666', marginTop: 60 } }, 'Congresso Nacional · Brasília')
      )
    ),
    { width: 1080, height: 1350 }
  );
  const png = Buffer.from(await resp.arrayBuffer());
  const { width, height, data } = PNG.sync.read(png);
  return Buffer.from(jpeg.encode({ data, width, height }, 90).data);
}

const cache = new Map();

/**
 * Mídia para "@ documento: PEC 45/2019 | Reforma tributária".
 * Devolve { id, imageUrl, conferir, credito } (o PDF de verdade, ou o cartão) ou null.
 */
export async function midiaDeDocumento(busca) {
  const [refBruta, tituloBruto] = String(busca || '').replace(/^documento:\s*/i, '').split('|').map((s) => s.trim());
  const ref = lerReferencia(refBruta);
  const chave = `${refBruta}|${tituloBruto}`;
  if (cache.has(chave)) return cache.get(chave);
  const trabalho = (async () => {
    if (ref) {
      try {
        const achado = (await pdfDaCamara(ref).catch(() => null)) || (await pdfDoSenado(ref).catch(() => null));
        if (achado) {
          const jpg = await primeiraPagina(achado.url);
          if (jpg) {
            const url = await guardar(jpg, `${ref.sigla}${ref.numero}-${ref.ano}`);
            console.log(`[documento] ${ref.sigla} ${ref.numero}/${ref.ano} -> PDF de verdade (${achado.fonte})`);
            return { id: `dc${ref.sigla}${ref.numero}${ref.ano}`, imageUrl: url, conferir: url, credito: `${ref.sigla} ${ref.numero}/${ref.ano} — inteiro teor — ${achado.fonte}` };
          }
        }
      } catch (e) {
        console.log(`[documento] ${refBruta}: não deu o PDF (${String(e.message || e).slice(0, 120)})`);
      }
    }
    const nomeRef = ref ? `${ref.sigla === 'MPV' ? 'MP' : ref.sigla} ${ref.numero}/${ref.ano}` : '';
    if (!nomeRef && !tituloBruto) return null;
    const jpg = await cartao(tituloBruto || refBruta, nomeRef);
    const url = await guardar(jpg, 'cartao');
    console.log(`[documento] cartão: ${nomeRef} ${tituloBruto || ''}`);
    return { id: `dk${Buffer.from(chave).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 20)}`, imageUrl: url, conferir: url, credito: null };
  })();
  cache.set(chave, trabalho);
  return trabalho;
}
