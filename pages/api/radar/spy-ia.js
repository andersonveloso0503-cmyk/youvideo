// Spy de Canal — parte de IA: lê os títulos que mais funcionaram no canal e
// devolve a fórmula, títulos modelados (não copiados), prompt de capa,
// descrição e tags prontas pro seu canal.
export const maxDuration = 120;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });

  const { canalNome, outliers = [], keywords = [], desempenho = {}, meuNicho = '', idioma = 'português do Brasil' } = req.body || {};
  if (!outliers.length) return res.status(400).json({ error: 'Analise um canal primeiro' });

  const lista = outliers
    .slice(0, 10)
    .map((v, i) => `${i + 1}. "${v.titulo}" — ${v.views} views (${v.vezesMedia}x a mediana), duração ${Math.round(v.duracao / 60)} min`)
    .join('\n');

  const prompt = `Você é um estrategista de YouTube especialista em "modelagem" de canais: entender o padrão do que funciona num canal de referência e criar conteúdo ORIGINAL que use o mesmo padrão, sem copiar.

Canal de referência: "${canalNome}"
Vídeos que mais estouraram (outliers):
${lista}
Palavras dominantes nos títulos: ${keywords.map((k) => k.palavra).join(', ')}
Dados: média de ${desempenho.mediaViews} views, posta a cada ${desempenho.intervaloDias} dias, melhor dia ${desempenho.melhorDia}, duração média dos top 5: ${Math.round((desempenho.duracaoMediaTop5 || 0) / 60)} min.
${meuNicho ? `Meu canal/nicho (adapte tudo pra ele): ${meuNicho}` : 'Adapte para um canal novo do mesmo nicho.'}

Regras:
- Nunca copie títulos, nomes de marca ou nome do canal de referência. Crie títulos novos que usem a mesma estrutura/gatilho.
- Escreva em ${idioma}.
- Retorne APENAS um JSON válido neste formato:
{
  "formula": "2 a 4 frases explicando em linguagem simples o padrão dos títulos que funcionam (estrutura, gatilho emocional, palavras, tamanho) e o formato dos vídeos",
  "padroes": ["3 a 5 estruturas de título em forma de molde, ex: 'Música pra [situação] | [sentimento]'"],
  "titulos": ["10 títulos originais prontos, seguindo os padrões"],
  "thumbnail": {
    "ideia": "descrição curta em português da capa ideal (composição, cores, texto grande)",
    "textoNaCapa": "texto curto (2 a 4 palavras) pra escrever grande na capa, em maiúsculas",
    "prompt": "prompt em INGLÊS, detalhado, pra gerar a imagem da capa numa IA de imagem (Flux), 16:9, sem texto na imagem"
  },
  "descricao": "descrição pronta pro YouTube (3 a 5 linhas) com gancho no início e 5 hashtags no final",
  "tags": ["15 tags relevantes"]
}`;

  const chamar = async (extra) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'user', content: prompt },
          ...(extra ? [{ role: 'user', content: 'Responda APENAS com o objeto JSON válido, sem texto antes ou depois.' }] : []),
        ],
        temperature: extra ? 0.4 : 0.8,
        max_completion_tokens: 6000,
        response_format: { type: 'json_object' },
      }),
    });
    return r.json();
  };

  try {
    let data = await chamar(false);
    let texto = data.choices?.[0]?.message?.content;
    let json;
    try { json = JSON.parse(texto); } catch (e) {
      data = await chamar(true);
      texto = data.choices?.[0]?.message?.content;
      try { json = JSON.parse(texto); } catch (e2) { json = null; }
    }
    if (!json) return res.status(500).json({ error: data.error?.message || 'A IA não devolveu uma resposta válida, tente de novo.' });
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
