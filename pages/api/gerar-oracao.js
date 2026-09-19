export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, duracaoDesejada } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema da oração é obrigatório' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });

  const duracaoSegundos = Number(duracaoDesejada) || 300;
  const palavrasAlvo = Math.round((duracaoSegundos / 60) * 130); // ~130 palavras/min falado, ritmo de oração (mais pausado que narração comum)

  const prompt = `Escreva uma oração cristã em português, em primeira pessoa, num tom pessoal, caloroso e acolhedor — como se um pastor estivesse guiando uma oração matinal, com pausas naturais e linguagem simples (não erudita).

Tema/foco da oração: "${tema}"

IMPORTANTE:
- O texto deve ter aproximadamente ${palavrasAlvo} palavras (${Math.round(duracaoSegundos / 60)} minutos falado num ritmo calmo). Se ${palavrasAlvo} for grande, desenvolva o tema em várias partes/seções diferentes (ex: gratidão, pedidos, intercessão, entrega do dia, louvor) para preencher bem o tempo sem ficar repetitivo.
- Não use marcações como [Verse] ou títulos — é só o texto corrido da oração, do jeito que seria falado.
- Comece de um jeito natural (ex: "Pai celestial, eu venho a Ti nessa manhã...") e termine com um "Em nome de Jesus, amém" ou variação.
- Evite clichês repetidos demais na mesma oração.

Responda APENAS com o texto da oração, sem nenhuma explicação antes ou depois.`;

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
        temperature: 0.8,
        max_completion_tokens: 4000,
      }),
    });
    const data = await groqRes.json();
    if (!groqRes.ok) throw new Error(data.error?.message || 'Erro ao gerar a oração');

    const texto = data.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ texto });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
