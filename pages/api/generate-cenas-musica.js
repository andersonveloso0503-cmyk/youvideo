export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { blocos, estilo } = req.body;
  if (!blocos || !blocos.length) {
    return res.status(400).json({ error: 'Nenhum bloco de letra recebido (rode a etapa de alinhamento primeiro)' });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  const prompt = `Você é diretor de arte de um canal de música gospel/cristã no YouTube.
Estilo visual escolhido: ${estilo}.
A seguir está a letra de uma música dividida em blocos (estrofe/refrão). Para CADA bloco, crie uma descrição visual de uma cena bíblica ou de fé que combine com o sentimento daquele trecho.

IMPORTANTE:
- Não repita a mesma cena em blocos diferentes, mesmo quando o refrão se repete — varie os cenários (natureza, templo, deserto, multidão em oração, luz do céu, mãos erguidas, etc.).
- Descreva de forma visualmente segura: evite armas, sangue, ferimentos, nudez, torso nu, violência. Vista sempre os personagens com roupas completas da época.
- Não inclua nenhum texto sobreposto na descrição da cena.
- Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{ "cenas": [ { "descricao": "descrição visual da cena" } ] }
A ordem das cenas no array deve ser EXATAMENTE a mesma ordem dos blocos abaixo, um item por bloco.

Blocos:
${blocos.map((b, i) => `${i + 1}. [${b.tipo}] ${b.texto}`).join('\n')}`;

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

    const cenas = (parsed.cenas || []).map((c, i) => ({
      descricao: c.descricao,
      start: blocos[i]?.start ?? 0,
      length: Math.max((blocos[i]?.end ?? 0) - (blocos[i]?.start ?? 0), 1),
    }));

    return res.status(200).json({ cenas });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
