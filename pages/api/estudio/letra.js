// Estúdio de Música — escreve (ou melhora) letra e sugere estilo com a Groq
// POST { acao: 'letra', tema, estilo, voz, letraAtual }  -> { titulo, letra }
// POST { acao: 'estilo', tema }                          -> { estilo }

export const config = { maxDuration: 60 };

// O modelo gpt-oss "pensa" antes de responder e esse pensamento gasta o limite
// de tokens — por isso o limite é alto e o esforço de raciocínio é baixo.
async function groq(prompt, maxTokens = 4000) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_completion_tokens: maxTokens,
      reasoning_effort: 'low',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro na Groq');
  return (d.choices?.[0]?.message?.content || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada.' });

  const { acao, tema, estilo, voz, letraAtual, detalhes } = req.body || {};
  const temSolo = /solo|intro instrumental|drop|pausa/i.test(detalhes || '');

  try {
    if (acao === 'estilo') {
      const txt = await groq(`Transforme a ideia de música abaixo numa descrição de estilo musical curta EM INGLÊS para um gerador de música com IA (gênero, clima, instrumentos, andamento). Máximo 25 palavras. Responda só com a descrição, sem aspas.

Ideia: ${tema || ''}`, 200);
      return res.status(200).json({ estilo: txt.replace(/^["']|["']$/g, '') });
    }

    if (!String(tema || '').trim() && !String(letraAtual || '').trim()) {
      return res.status(400).json({ erro: 'Escreva o tema da música.' });
    }

    const base = letraAtual && letraAtual.trim()
      ? `Melhore a letra abaixo mantendo a ideia, deixando mais cantável, com rimas naturais e refrão forte e fácil de lembrar.\n\nLetra atual:\n${letraAtual}`
      : `Escreva uma letra de música ORIGINAL sobre: ${tema}`;

    const pedido = `${base}

Regras:
- Português do Brasil, linguagem natural e emocionante.
${estilo ? `- Estilo musical: ${estilo}.` : ''}
${voz ? `- Vai ser cantada por: ${voz}.` : ''}
${detalhes ? `- Arranjo pedido: ${detalhes}.` : ''}
${temSolo ? '- Inclua na estrutura as partes instrumentais pedidas, cada uma em linha própria SEM letra, por exemplo [Instrumental Intro], [Guitar Solo], [Trumpet Solo], [Sax Solo], [Piano Solo], [Violin Solo] ou [Instrumental Break] (geralmente o solo vem depois do segundo refrão).' : ''}
- Estrutura com marcações em inglês entre colchetes, cada uma em linha própria: [Verse], [Pre-Chorus], [Chorus], [Verse], [Chorus], [Bridge], [Chorus], [Outro].
- Versos com 4 linhas; refrão repetido igual nas vezes em que aparece.
- Duração pensada para uns 3 minutos.
- NÃO copie trechos de músicas existentes.

Responda EXATAMENTE neste formato:
TÍTULO: <título curto>
LETRA:
<letra com as marcações>`;

    // Às vezes a IA devolve vazio ou cortado — tenta até 3 vezes
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const txt = await groq(pedido);
      const mTitulo = txt.match(/T[ÍI]TULO:\s*(.+)/i);
      const letra = (txt.split(/LETRA:\s*/i)[1] || txt).replace(/^```\w*|```$/g, '').trim();
      const linhasCantadas = letra.split('\n').filter((l) => l.trim() && !/^\s*\[.*\]\s*$/.test(l));
      if (linhasCantadas.length >= 8) {
        return res.status(200).json({
          titulo: (mTitulo ? mTitulo[1] : '').replace(/[*"#]/g, '').trim(),
          letra,
        });
      }
    }
    return res.status(500).json({ erro: 'A IA não conseguiu escrever a letra agora. Tente de novo em instantes.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
