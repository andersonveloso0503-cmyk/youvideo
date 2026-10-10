// Fábrica de Música (Compilador): dados dos álbuns automáticos e capa feita pelo Gemini.
//
// GET                         -> { presets: [{ id, nome, gospel, estilo, instrumentos, tema, vozes }] }
// POST { acao: 'capa', estilo, gospel, titulos[], ano? }
//                             -> { titulo, subtitulo, capaUrl (16:9 com texto), fundoUrl (9:16 sem texto, para os Shorts) }
//
// Chaves na Vercel: GEMINI_API_KEY (a mesma do Lyria), GROQ_API_KEY. Opcional: GEMINI_IMAGE_MODEL.
import { put } from '@vercel/blob';
import { exigirToken } from '../../../lib/central';
import { ALBUM_PRESETS, ESTILOS, TODAS_IDEIAS, ritmoEn, ideiasEmTexto } from '../../../lib/estudioDados';

export const config = { maxDuration: 300 };

// Vozes que combinam com cada estilo (o álbum alterna entre elas, música a música)
const VOZES_DO_PRESET = {
  'sertanejo-gospel': ['dupla', 'masc-suave', 'fem-suave'],
  sertanejo: ['dupla', 'masculina', 'feminina'],
  'sertanejo-potente': ['dupla', 'masc-potente'],
  gaucha: ['masculina', 'masc-rouca'],
  pagode: ['masculina', 'masc-suave'],
  'pagode-gospel': ['masculina', 'masc-suave', 'feminina'],
  forro: ['masculina', 'feminina'],
  rock: ['masc-rouca', 'masc-potente'],
  metal: ['masc-potente'],
  'blues-raiz': ['masc-rouca', 'feminina'],
  'blues-gospel': ['masc-rouca', 'fem-potente'],
  rap: ['masculina'],
  trap: ['masculina'],
  'gospel-animado': ['fem-potente', 'masc-potente'],
  louvor: ['masc-potente', 'fem-potente', 'masc-suave', 'fem-suave'],
};
const VOZES_PADRAO = ['masc-potente', 'fem-potente', 'masc-suave', 'fem-suave'];

function presets() {
  return ALBUM_PRESETS.map((p) => {
    const est = ESTILOS.find((e) => e.id === p.estiloId) || ESTILOS[0];
    return {
      id: p.id,
      nome: p.nome,
      gospel: p.gospel,
      tema: p.tema,
      estilo: [est.base, ritmoEn(p.ritmo), ideiasEmTexto(p.ideias), p.extra || ''].filter(Boolean).join(', '),
      instrumentos: p.ideias.map((id) => TODAS_IDEIAS.find((x) => x.id === id)?.nome).filter(Boolean).join(', '),
      vozes: VOZES_DO_PRESET[p.id] || VOZES_PADRAO,
    };
  });
}

async function groqJson(pedido) {
  for (const modelo of ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: modelo, temperature: 0.9, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: pedido }] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || `Groq ${r.status}`);
      return JSON.parse(d.choices?.[0]?.message?.content || '{}');
    } catch { /* tenta o próximo */ }
  }
  return {};
}

// Gemini (Nano Banana): devolve a imagem em base64
async function imagemGemini(prompt, proporcao) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não está configurada na Vercel.');
  const modelos = [...new Set([process.env.GEMINI_IMAGE_MODEL, 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'].filter(Boolean))];
  let ultimoErro = '';
  for (const modelo of modelos) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: proporcao } },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || `Gemini ${r.status}`);
      const parte = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
      if (!parte) throw new Error(`o Gemini não devolveu imagem (${d.candidates?.[0]?.finishReason || 'sem motivo'})`);
      return { buffer: Buffer.from(parte.inlineData.data, 'base64'), mime: parte.inlineData.mimeType || 'image/png' };
    } catch (e) {
      ultimoErro = `${modelo}: ${e.message}`;
    }
  }
  throw new Error(`Capa não gerada — ${ultimoErro}`);
}

async function salvar(img, nome) {
  const ext = /jpe?g/.test(img.mime) ? 'jpg' : 'png';
  const b = await put(`musica-auto/${nome}.${ext}`, img.buffer, {
    access: 'public',
    contentType: img.mime,
    token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  return b.url;
}

function limparTexto(t, max) {
  return String(t || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method === 'GET') return res.status(200).json({ presets: presets() });
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const { acao } = req.body || {};
  if (acao !== 'capa') return res.status(400).json({ erro: 'Ação desconhecida.' });
  try {
    const estilo = limparTexto(req.body.estilo, 60) || 'Gospel';
    const gospel = req.body.gospel === true;
    const titulos = (Array.isArray(req.body.titulos) ? req.body.titulos : []).map((t) => limparTexto(t, 60)).filter(Boolean).slice(0, 20);
    const agora = new Date();
    const ano = Number(req.body.ano) || agora.getFullYear() + (agora.getMonth() >= 9 ? 1 : 0);
    const evitar = (Array.isArray(req.body.evitar) ? req.body.evitar : []).map((t) => limparTexto(t, 60)).filter(Boolean).slice(0, 30);

    const ideia = await groqJson(`Você cria capas de coletâneas musicais para o YouTube no Brasil (estilo "LOUVORES QUE ACALMAM ${ano}", "SERTANEJO ROMÂNTICO AS MELHORES", "PAGODE GOSPEL VOL. 2").
Coletânea de músicas ${gospel ? 'GOSPEL ' : ''}no estilo ${estilo}. Algumas músicas: ${titulos.join('; ') || '(sem títulos)'}.
${evitar.length ? `Não repita estes títulos de capas que já fiz: ${evitar.join('; ')}.\n` : ''}
Responda só JSON:
{"titulo": "título da capa em MAIÚSCULAS, 2 a 5 palavras, português correto, chamativo, que diga o estilo e o clima (ex.: LOUVORES QUE ACALMAM)",
 "subtitulo": "linha menor em MAIÚSCULAS, até 4 palavras (ex.: AS MAIS TOCADAS ${ano} / VOL. 2 / PARA ORAR)",
 "cena": "em INGLÊS, 1 a 2 frases: a cena da capa com um(a) cantor(a) fictício(a) cantando ou tocando, o cenário e a luz que combinam com o estilo e o clima${gospel ? ' (louvor, fé, luz suave do céu, sem símbolos de outras religiões)' : ''}"}`);
    const titulo = limparTexto(ideia.titulo, 40).toUpperCase() || `${estilo.toUpperCase()} ${gospel ? 'LOUVORES' : 'AS MELHORES'}`;
    const subtitulo = limparTexto(ideia.subtitulo, 30).toUpperCase() || String(ano);
    const cena = limparTexto(ideia.cena, 500) || `a fictional ${gospel ? 'worship ' : ''}singer performing ${estilo} music on a warmly lit stage`;

    const comum = `Scene: ${cena}
Style: professional Brazilian ${gospel ? 'gospel ' : ''}${estilo} music album cover, cinematic lighting, rich vibrant colors, high contrast, sharp focus, photorealistic, premium look.
The singer is a fictional person, not a celebrity or real person. No logos, no watermarks, no brand names, no extra words.`;
    const [capa, fundo] = await Promise.all([
      imagemGemini(
        `Create a YouTube thumbnail for a music compilation, 16:9 landscape.
${comum}
Text on the image (Brazilian Portuguese, spelled EXACTLY like this, with the accents): big bold title "${titulo}" and a smaller line "${subtitulo}". The text must be large, clean and easy to read on a phone, with strong contrast. No other text.`,
        '16:9'
      ),
      imagemGemini(`Create a vertical 9:16 background image for a music video.\n${comum}\nNo text at all on the image. Keep the singer centered.`, '9:16').catch(() => null),
    ]);
    const marca = `${Date.now()}`;
    const capaUrl = await salvar(capa, `capa-${marca}`);
    const fundoUrl = fundo ? await salvar(fundo, `fundo-${marca}`) : null;
    return res.status(200).json({ titulo, subtitulo, cena, capaUrl, fundoUrl });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
