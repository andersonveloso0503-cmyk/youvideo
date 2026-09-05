export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, estilo, formato, duracaoDesejada } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema é obrigatório' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  const duracaoSegundos = Number(duracaoDesejada) || (formato === 'short' ? 180 : 420);
  const palavrasAlvo = Math.round(duracaoSegundos * 2.3); // ritmo médio de narração em português
  const duracaoMin = Math.floor(duracaoSegundos / 60);
  const duracaoSeg = duracaoSegundos % 60;

  const formatoInstrucao =
    formato === 'short'
      ? `Formato Short: a narração precisa ter aproximadamente ${palavrasAlvo} palavras (pra durar bem perto de ${duracaoMin > 0 ? `${duracaoMin}min ` : ''}${duracaoSeg}s ao ser falada), gancho forte nos primeiros 3 segundos, ritmo direto.`
      : `Formato vídeo longo: a narração precisa ter aproximadamente ${palavrasAlvo} palavras (pra durar bem perto de ${duracaoMin}min ao ser falada), com introdução, desenvolvimento e conclusão bem desenvolvidos — não encurte o conteúdo, expanda com contexto histórico e detalhes da história pra atingir esse tamanho.`;

  const prompt = `Você é roteirista de um canal de histórias bíblicas no YouTube.
Tema: "${tema}"
Estilo visual: ${estilo}
${formatoInstrucao}

IMPORTANTE:
- Descreva cenas de forma visualmente segura para geração por IA: evite completamente palavras como "cruz", "crucificação", "sangue", "ferimentos", "soldados armados", "chicote", "coroa de espinhos" nas descrições visuais — mesmo cenas de sofrimento ou morte devem ser descritas de forma simbólica e indireta (ex: "silhueta ao entardecer, luz dourada, expressão serena", "figura solitária numa colina, céu dramático") em vez de literal. Transmita a emoção pela luz, composição e expressão do rosto, nunca por elementos de violência explícitos na descrição.
- Não copie trechos literais de nenhuma tradução da Bíblia; narre a história com suas próprias palavras, de forma envolvente e fiel ao relato.
- Divida a narração em cenas curtas, pensando em cada cena como um clipe de vídeo separado.
- GATILHOS DE RETENÇÃO (aplique de verdade, não apenas mencione):
  1. Nos primeiros 3-5 segundos da narração, comece com uma pergunta intrigante, uma afirmação surpreendente ou um "flash-forward" do momento mais tenso da história (ex: "O que você faria se descobrisse que seu melhor amigo te traiu por 30 moedas?") — nunca comece com "Olá" ou apresentação genérica.
  2. No meio da narração, insira pelo menos um "gancho de continuidade" (ex: "mas o que aconteceu a seguir mudaria tudo...") pra segurar quem está pensando em sair.
  3. Termine com uma pergunta reflexiva pro espectador ou um convite claro pra comentar/seguir a série (ex: "Você já passou por uma situação parecida? Conta nos comentários.").
  4. Use frases curtas e diretas na narração, evite parágrafos longos e formais — o tom deve soar como alguém contando uma história empolgante, não uma aula.
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
          max_completion_tokens: 8000,
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
