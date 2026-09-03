export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, estilo, formato } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema é obrigatório' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  const formatoInstrucao =
    formato === 'short'
      ? 'Formato Short: narração de 30 a 50 segundos, direto ao ponto, gancho forte nos primeiros 3 segundos.'
      : 'Formato vídeo longo: narração de 4 a 7 minutos, com introdução, desenvolvimento e conclusão.';

  const prompt = `Você é roteirista de um canal de histórias bíblicas no YouTube.
Tema: "${tema}"
Estilo visual: ${estilo}
${formatoInstrucao}

IMPORTANTE:
- Não copie trechos literais de nenhuma tradução da Bíblia; narre a história com suas próprias palavras, de forma envolvente e fiel ao relato.
- Divida a narração em cenas curtas, pensando em cada cena como um clipe de vídeo separado.
- Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "titulo": "título chamativo mas não enganoso, em português",
  "descricao": "descrição para o YouTube, 2-3 frases + contexto",
  "tags": ["tag1", "tag2", "..."],
  "narracao": "texto completo da narração, em português",
  "cenas": [
    { "descricao": "descrição visual da cena para gerar imagem/vídeo", "textoNarrado": "trecho da narração correspondente" }
  ]
}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) throw new Error(data.error?.message || 'Erro na Groq');

    let content = data.choices[0].message.content.trim();
    content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(content);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
