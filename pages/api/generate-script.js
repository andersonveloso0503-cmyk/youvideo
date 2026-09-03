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
- Descreva cenas de forma visualmente segura para geração por IA: evite ferimentos, sangue, violência gráfica ou sofrimento físico explícito nas descrições visuais das cenas — prefira transmitir emoção e tensão pela expressão dos personagens, luz e composição, não por detalhes gráficos.
- Não copie trechos literais de nenhuma tradução da Bíblia; narre a história com suas próprias palavras, de forma envolvente e fiel ao relato.
- Divida a narração em cenas curtas, pensando em cada cena como um clipe de vídeo separado.
- Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "titulo": "título chamativo mas não enganoso, em português",
  "descricao": "descrição completa para o YouTube, em português: um parágrafo de abertura envolvente (2-3 frases resumindo o vídeo), seguido de mais contexto sobre a história e seu significado (pelo menos 150 palavras no total), terminando com 3-5 hashtags relevantes",
  "tags": ["12 a 15 tags relevantes em português, misturando termos amplos (ex: história bíblica) e específicos (ex: nome do personagem)"],
  "narracao": "texto completo da narração, em português",
  "cenas": [
    { "descricao": "descrição visual da cena para gerar imagem/vídeo", "textoNarrado": "trecho da narração correspondente" }
  ]
}`;

  try {
    const chamarGroq = async (tentativaExtra) => {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'user', content: prompt },
            ...(tentativaExtra
              ? [{ role: 'user', content: 'Sua última resposta não era um JSON válido. Responda APENAS com o objeto JSON, sem nenhum texto antes ou depois, sem comentários, com todas as aspas internas escapadas corretamente.' }]
              : []),
          ],
          temperature: tentativaExtra ? 0.4 : 0.8,
          max_completion_tokens: 6000,
          response_format: { type: 'json_object' },
        }),
      });
      return groqRes.json();
    };

    let data = await chamarGroq(false);
    let content = data.choices?.[0]?.message?.content?.trim() || '';
    content = content.replace(/^```json/, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Segunda tentativa, mais conservadora, pedindo explicitamente JSON puro.
      data = await chamarGroq(true);
      content = data.choices?.[0]?.message?.content?.trim() || '';
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(
          'A resposta do modelo não veio em JSON válido mesmo após tentar de novo. Tente um tema mais simples ou direto.'
        );
      }
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
