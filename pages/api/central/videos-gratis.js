// Vídeos reais e grátis (Pexels; Pixabay se tiver a chave) para as cenas dos Sons para dormir
// e para o fundo de cenas do vídeo longo da Fábrica de Música (uso: 'musica').
// POST { tema, prompt, quantidade, evitar: ['pexels-123', ...], uso?: 'musica', gospel?: true }
//   -> { videos: [{ id, url, largura, altura, duracao, fonte, autor, pagina }] }
// Chaves na Vercel (grátis): PEXELS_API_KEY (pexels.com/api) e, opcional, PIXABAY_API_KEY (pixabay.com/api/docs).
// A licença do Pexels e do Pixabay permite usar em vídeos do YouTube, inclusive monetizados.
import { exigirToken } from '../../../lib/central';

export const config = { maxDuration: 60 };

// Buscas prontas por estilo de música (em inglês, que é como o Pexels acha melhor)
function buscasMusica(tema, gospel) {
  const t = String(tema || '').toLowerCase();
  let base;
  if (/sertanej|modão|modao|raiz|country|viola/.test(t)) base = ['countryside golden hour', 'farm field sunset drone', 'rural dirt road', 'horses grazing sunset', 'wheat field wind'];
  else if (/pagode|samba/.test(t)) base = ['tropical beach sunset', 'rio de janeiro aerial', 'city lights evening aerial', 'palm trees golden hour', 'ocean waves sunset'];
  else if (/forr[oó]|nordest/.test(t)) base = ['sertao landscape', 'dry land sunset', 'rural village aerial', 'sunrise countryside'];
  else base = ['mountains aerial golden hour', 'lake drone sunrise', 'waterfall aerial', 'clouds sunlight rays', 'green valley drone'];
  return gospel ? [...base, 'sunlight through clouds', 'countryside church aerial'] : base;
}

async function buscasDaIa(tema, prompt, uso, gospel) {
  if (!process.env.GROQ_API_KEY) return [];
  const pedido = uso === 'musica'
    ? `I need free stock footage (Pexels) for the background of a ${gospel ? 'Christian worship ' : ''}music lyric video on YouTube.
Music style: "${tema}". ${String(prompt || '').slice(0, 300)}
Write 5 short English search queries (2 to 4 words each) that find beautiful cinematic real footage with slow camera movement (drone, landscapes, sky, golden hour, nature, scenery) matching the mood of this music style. No people facing the camera, no text, no concerts, no religious symbols of other religions. Most specific first.
Reply only JSON: {"buscas": ["...", "...", "...", "...", "..."]}`
    : `I need free stock footage (Pexels) for a calm "sounds to sleep" YouTube video.
Theme: "${tema}". Scene idea: ${String(prompt || '').slice(0, 500)}
Write 4 short English search queries (2 to 4 words each) that find calm, beautiful, real nature/ambience footage matching the theme (no people talking, no text). Most specific first.
Reply only JSON: {"buscas": ["...", "...", "...", "..."]}`;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: pedido }],
      }),
    });
    const d = await r.json();
    const j = JSON.parse(d.choices?.[0]?.message?.content || '{}');
    return (Array.isArray(j.buscas) ? j.buscas : []).map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

// Melhor arquivo do vídeo: horizontal, o mais perto de 1920 de largura (sem passar de 2560, para não pesar)
function melhorArquivoPexels(v) {
  const mp4 = (v.video_files || []).filter((f) => /mp4/i.test(f.file_type || '') && f.width && f.height && f.width >= f.height && f.width <= 2560);
  return mp4.sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0] || null;
}

async function pexels(busca, porPagina = 15) {
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(busca)}&orientation=landscape&size=large&per_page=${porPagina}`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!r.ok) throw new Error(`Pexels respondeu ${r.status}`);
  const d = await r.json();
  return (d.videos || [])
    .filter((v) => (v.duration || 0) >= 8)
    .map((v) => {
      const f = melhorArquivoPexels(v);
      return f && { id: `pexels-${v.id}`, url: f.link, largura: f.width, altura: f.height, duracao: v.duration, fonte: 'Pexels', autor: v.user?.name || '', pagina: v.url || '' };
    })
    .filter(Boolean);
}

async function pixabay(busca) {
  const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY)}&q=${encodeURIComponent(busca)}&per_page=15&safesearch=true`);
  if (!r.ok) throw new Error(`Pixabay respondeu ${r.status}`);
  const d = await r.json();
  return (d.hits || [])
    .filter((v) => (v.duration || 0) >= 8)
    .map((v) => {
      const f = v.videos?.large?.url ? v.videos.large : v.videos?.medium;
      return f?.url && f.width >= f.height && { id: `pixabay-${v.id}`, url: f.url, largura: f.width, altura: f.height, duracao: v.duration, fonte: 'Pixabay', autor: v.user || '', pagina: v.pageURL || '' };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.PEXELS_API_KEY && !process.env.PIXABAY_API_KEY) {
    return res.status(400).json({ erro: 'Falta a chave grátis do Pexels: crie em pexels.com/api e coloque na Vercel como PEXELS_API_KEY (depois faça Redeploy).' });
  }
  const b = req.body || {};
  const tema = String(b.tema || '').slice(0, 120);
  const qtd = Math.max(1, Math.min(20, Number(b.quantidade) || 6));
  const evitar = new Set((Array.isArray(b.evitar) ? b.evitar : []).map(String));
  const uso = b.uso === 'musica' ? 'musica' : 'dormir';
  const gospel = !!b.gospel;
  const buscas = uso === 'musica'
    ? [...new Set([...(await buscasDaIa(tema, b.prompt, uso, gospel)), ...buscasMusica(tema, gospel)])]
    : [...(await buscasDaIa(tema, b.prompt, uso, gospel)), tema].filter(Boolean);
  // Música: poucos vídeos de cada busca, para as cenas variarem (não 10 tomadas da mesma montanha)
  const porBusca = uso === 'musica' ? 3 : Infinity;
  const achados = [];
  const vistos = new Set();
  try {
    for (const busca of buscas) {
      if (achados.length >= qtd) break;
      const lotes = await Promise.all([
        process.env.PEXELS_API_KEY ? pexels(busca).catch(() => []) : [],
        process.env.PIXABAY_API_KEY ? pixabay(busca).catch(() => []) : [],
      ]);
      let destaBusca = 0;
      for (const v of lotes.flat()) {
        if (destaBusca >= porBusca) break;
        if (evitar.has(v.id) || vistos.has(v.id)) continue;
        destaBusca++;
        vistos.add(v.id);
        achados.push({ ...v, busca });
        if (achados.length >= qtd) break;
      }
    }
    return res.status(200).json({ videos: achados, buscas });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
