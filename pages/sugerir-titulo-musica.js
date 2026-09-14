export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { letra, estilo, isMedley } = req.body;
  if ((!letra || !letra.trim()) && !isMedley) return res.status(400).json({ error: 'Letra é obrigatória' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });

  const prompt = isMedley
    ? `Você escreve títulos de vídeo de YouTube pra coletâneas/medleys de música gospel, no formato que mais gera cliques nesse nicho: "[CHAMADA EM CAIXA ALTA] — Coletânea [complemento emocional]".

Exemplos do padrão certo (confirmados com dados reais de canais gospel de sucesso):
- "1 HORA DE LOUVOR GOSPEL — Coletânea Sertanejo, Forró e Pagode Pra Deus"
- "OS MAIS TOCADOS DO GOSPEL ANIMADO — Coletânea Pra Adorar Dançando"
- "MELHORES LOUVORES GOSPEL 2026 — Coletânea Que Vai Te Emocionar"
- "PLAYLIST GOSPEL 2026 — As Melhores Músicas Pra Adorar Sem Parar" (a palavra "playlist gospel" tem alta busca e baixa concorrência — use esse formato de vez em quando)

Baseado na letra(s) abaixo (pode ser um resumo de várias músicas), escreva APENAS UM título nesse estilo (só o título, sem explicação, sem aspas):

${letra}`
    : `Você escreve títulos de vídeo de YouTube pra músicas gospel. Existem 2 padrões válidos, confirmados com dados reais de canais gospel brasileiros de sucesso — prefira o PADRÃO PRINCIPAL, e só use o alternativo se o principal não capturar bem o clima da letra.

PADRÃO PRINCIPAL (preferido — foi o que gerou os maiores picos de visualização já confirmados, mais de 1 milhão de views): título CURTO E DIRETO, só o nome/tema da música em CAIXA ALTA, 2 a 4 palavras fortes e emocionais, sem frase longa de gancho na frente.
Exemplos reais confirmados:
- "LUTADOR IMPLACÁVEL"
- "AMOR ESQUECIDO"
- "DEUS CONTA COM VOCÊ"

PADRÃO ALTERNATIVO (use só se o principal ficar fraco pra essa letra específica): frase de impacto ou pergunta que gera curiosidade/emoção, ANTES do nome literal da música, com 1-2 emojis.
Exemplos:
- "Quando Tudo Parece Impossível, Ouça Isso 🙏 Caminhando na Fé"
- "Seu Milagre Está Mais Perto do Que Você Pensa ✨"

Exceção: se a música for no estilo BLUES GOSPEL, use esse outro padrão em vez dos de cima, seguindo o exemplo real de maior sucesso encontrado no nicho ("QUANDO O FORTE TAMBÉM CHORA | Samuel Riviers | Blues Gospel Worship" — 461 mil views):
"[FRASE DE IMPACTO EM CAIXA ALTA] | [Nome da música] | Blues Gospel"

Baseado na letra abaixo${estilo ? ` (estilo: ${estilo})` : ''}, escreva APENAS UM título no padrão certo pro caso (só o título, sem explicação, sem aspas):

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
