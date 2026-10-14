// Fábrica de Música (Compilador): dados dos álbuns automáticos e capa feita pelo Gemini.
//
// GET                         -> { presets: [{ id, nome, gospel, estilo, instrumentos, tema, vozes }] }
// POST { acao: 'titulos', nomes[] }   -> { titulos[] | null }  (nomes de arquivo viram títulos)
// POST { acao: 'capa', estilo, gospel, titulos[], ano?, idioma? ('en' = capa em inglês) }
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
  // Nomes de arquivo (ex.: "nuivi-graca-que-me-alcancou-louvores-em-pagode-v1") viram títulos em português correto
  if (acao === 'titulos') {
    const nomes = (Array.isArray(req.body.nomes) ? req.body.nomes : []).map((t) => limparTexto(t, 120)).slice(0, 40);
    if (!nomes.length) return res.status(200).json({ titulos: [] });
    const r = await groqJson(`Estes são nomes de arquivos de músicas. Para cada um, escreva o TÍTULO da música NO MESMO IDIOMA do nome: se o nome está em português, em português do Brasil correto, com acentos (ex.: "Graça Que Me Alcançou"); se está em inglês, em inglês correto, com maiúsculas no estilo de título (ex.: "Joy Comes in the Morning"). Nunca traduza.
Tire prefixos de site e de versão (nuivi, suno, v1, v2, final), números de faixa e palavras que são só a descrição do estilo quando sobrar um título claro antes delas. Não invente palavras novas.
Responda só JSON: {"titulos": ["...", "..."]} na MESMA ordem e com a MESMA quantidade (${nomes.length}).
Nomes:
${nomes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
    const titulos = Array.isArray(r.titulos) && r.titulos.length === nomes.length ? r.titulos.map((t, i) => limparTexto(t, 80) || nomes[i]) : null;
    return res.status(200).json({ titulos });
  }
  if (acao !== 'capa') return res.status(400).json({ erro: 'Ação desconhecida.' });
  try {
    const en = req.body.idioma === 'en'; // músicas em inglês: capa em inglês
    const estilo = limparTexto(req.body.estilo, 60) || 'Gospel';
    const gospel = req.body.gospel === true;
    const titulos = (Array.isArray(req.body.titulos) ? req.body.titulos : []).map((t) => limparTexto(t, 60)).filter(Boolean).slice(0, 20);
    const agora = new Date();
    const ano = Number(req.body.ano) || agora.getFullYear() + (agora.getMonth() >= 9 ? 1 : 0);
    const evitar = (Array.isArray(req.body.evitar) ? req.body.evitar : []).map((t) => limparTexto(t, 60)).filter(Boolean).slice(0, 30);

    const ideia = en
      ? await groqJson(`You design YouTube thumbnails for music compilations in the United States (like "WORSHIP SONGS THAT HEAL ${ano}", "UPBEAT GOSPEL HITS", "SUNDAY MORNING PRAISE VOL. 2").
Compilation of ${gospel ? 'GOSPEL ' : ''}songs in the style: ${estilo}. Some songs: ${titulos.join('; ') || '(no titles)'}.
${evitar.length ? `Do not repeat these titles I already used: ${evitar.join('; ')}.\n` : ''}
The English must sound natural to an American (no odd word choices, no literal translations from Portuguese).
Reply only JSON:
{"titulo": "cover title in UPPERCASE English, 2 to 5 words, catchy, says the style and the mood (e.g. WORSHIP SONGS THAT HEAL)",
 "subtitulo": "smaller line in UPPERCASE English, up to 4 words (e.g. THE BEST OF ${ano} / VOL. 2 / FOR PRAYER)",
 "cena": "1 to 2 sentences: the cover scene with a fictional singer singing or playing, the setting and light that match the style and mood${gospel ? ' (worship, faith, soft heavenly light, no symbols of other religions)' : ''}"}`)
      : await groqJson(`Você cria capas de coletâneas musicais para o YouTube no Brasil (estilo "LOUVORES QUE ACALMAM ${ano}", "SERTANEJO ROMÂNTICO AS MELHORES", "PAGODE GOSPEL VOL. 2").
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
Style: professional ${en ? 'American' : 'Brazilian'} ${gospel ? 'gospel ' : ''}${estilo} music album cover, cinematic lighting, rich vibrant colors, high contrast, sharp focus, photorealistic, premium look.
The singer is a fictional person, not a celebrity or real person. No logos, no watermarks, no brand names, no extra words.`;
    const [capa, fundo] = await Promise.all([
      imagemGemini(
        `Create a VERY eye-catching YouTube thumbnail for a music compilation, 16:9 landscape.
${comum}
Make it bold and flashy: rich saturated colors, warm glow and light effects, dramatic sky (deep purple/blue night or golden sunset), the singer close to the camera on one side with a strong emotional expression.
Text on the image (${en ? 'English' : 'Brazilian Portuguese, with the accents'}, spelled EXACTLY like this and nothing else):
- the title "${titulo}" HUGE, filling about half of the image, in thick bold 3D letters, bright yellow/gold and white with a thick black outline and a soft glow; the most important word even bigger, the words can have different sizes and colors
- "${subtitulo}" smaller, inside a ribbon/banner badge (white text on a red or purple banner) under the title
Put the text on the side opposite to the singer's face, and keep the bottom-right corner free (YouTube shows the duration there). Must be readable as a tiny thumbnail on a phone. No other text.`,
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
