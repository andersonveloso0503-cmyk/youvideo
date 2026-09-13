export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { letra } = req.body;
  if (!letra || !letra.trim()) return res.status(400).json({ error: 'Letra é obrigatória' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });

  const prompt = `Você escreve títulos de vídeo de YouTube pra músicas gospel, no estilo que mais gera cliques: uma frase de impacto ou pergunta que gera curiosidade/emoção, ANTES do nome literal da música, geralmente com 1-2 emojis relevantes.

Exemplos do padrão certo:
- "Quando Tudo Parece Impossível, Ouça Isso 🙏 Caminhando na Fé"
- "Seu Milagre Está Mais Perto do Que Você Pensa ✨"
- "Deus Abre Caminho Onde Você Não Vê Saída 🌊"
- "Chega de Fé Morna, Peça o Fogo de Deus 🔥"

Baseado na letra abaixo, escreva APENAS UM título nesse estilo (só o título, sem explicação, sem aspas):

${letra}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_completion_tokens: 100,
      }),
    });
    const data = await groqRes.json();
    if (!groqRes.ok) throw new Error(data.error?.message || 'Erro ao gerar título');

    let titulo = data.choices?.[0]?.message?.content?.trim() || '';
    titulo = titulo.replace(/^["']|["']$/g, ''); // tira aspas se vierem

    return res.status(200).json({ titulo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
