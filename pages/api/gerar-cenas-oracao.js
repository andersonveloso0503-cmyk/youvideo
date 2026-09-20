export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };
export const maxDuration = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texto, estilo, temPersonagem } = req.body;
  if (!texto?.trim()) return res.status(400).json({ error: 'Texto da oração é obrigatório' });
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  // 1 cena a cada ~120 palavras, com um mínimo de 3 (pra nunca ficar parado
  // numa imagem só) e um máximo de 10 (custo de gerar imagem por cena).
  const totalPalavras = texto.trim().split(/\s+/).length;
  const nCenasAlvo = Math.min(10, Math.max(3, Math.round(totalPalavras / 120)));

  const prompt = `Você é diretor de arte de um canal de vídeos bíblicos/devocionais no YouTube.
Estilo visual: ${estilo || 'realista'}.

Abaixo está o texto completo de uma oração/narração. Divida esse texto em exatamente ${nCenasAlvo} partes SEQUENCIAIS (na ordem em que aparecem, cobrindo o texto do início ao fim sem pular nada) e, para CADA parte, crie uma descrição visual de cena que ilustre especificamente o que está sendo dito ali (eventos, lugares, símbolos, natureza, luz, expressões) — nunca repita a mesma cena genérica em partes diferentes, mesmo que o texto repita uma ideia.
${
  temPersonagem
    ? 'Existe um personagem/narrador principal aparecendo no vídeo. Inclua ele em CADA descrição de cena, de forma consistente com o que está sendo narrado naquele trecho (ex: "o narrador caminha por...", "o narrador observa...", "o narrador aponta para...").'
    : 'Não inclua nenhum personagem/narrador humano específico nas cenas — foque em paisagens, símbolos e elementos bíblicos.'
}

IMPORTANTE:
- Evite completamente armas, espadas, facas, sangue, ferimentos, nudez, torso nu, violência explícita — descreva momentos difíceis de forma simbólica e indireta (luz, silhueta, expressão) em vez de literal.
- Vista sempre os personagens com roupas completas e típicas da época.
- Não inclua nenhum texto sobreposto na descrição da cena.
- Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{ "cenas": [ { "descricao": "descrição visual da cena" } ] }
Exatamente ${nCenasAlvo} cenas, na mesma ordem em que os trechos aparecem no texto.

Texto:
${texto}`;

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
              ? [{ role: 'user', content: 'Sua última resposta não era um JSON válido. Responda APENAS com o objeto JSON, sem texto antes ou depois.' }]
              : []),
          ],
          temperature: tentativaExtra ? 0.4 : 0.8,
          max_completion_tokens: 4000,
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
      data = await chamarGroq(true);
      content = data.choices?.[0]?.message?.content?.trim() || '';
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
      parsed = JSON.parse(content);
    }

    const cenas = (parsed.cenas || []).map((c) => ({ descricao: c.descricao }));
    if (!cenas.length) throw new Error('Não consegui gerar nenhuma cena a partir do texto');

    return res.status(200).json({ cenas });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
