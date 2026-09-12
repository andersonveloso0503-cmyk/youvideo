export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioUrl } = req.body;
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl é obrigatório' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY não configurada' });

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error('Não consegui baixar esse áudio pra transcrever');
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    const form = new FormData();
    form.append('file', new Blob([audioBuffer]), 'audio.mp3');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('language', 'pt');

    const transRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    const transData = await transRes.json();
    if (!transRes.ok) throw new Error(transData.error?.message || 'Erro ao transcrever no Groq');

    const textoCorrido = transData.text || '';
    const textoFormatado = await formatarComoLetra(textoCorrido);

    return res.status(200).json({ texto: textoCorrido, textoFormatado });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function formatarComoLetra(textoCorrido) {
  if (!textoCorrido.trim()) return '';

  const prompt = `A frase abaixo é a transcrição bruta (tudo corrido, sem pontuação de estrutura) de uma música em português. Organize em linhas curtas, do jeito que uma letra de música normalmente é escrita, E identifique os blocos usando as tags [Verse], [Chorus], [Pre-Chorus], [Bridge] (repita [Chorus] toda vez que o mesmo refrão se repetir).

IMPORTANTE:
- NÃO invente, resuma ou troque palavras — use exatamente as palavras da transcrição, só reorganizando em linhas e adicionando as tags de bloco.
- Se não tiver certeza da pontuação exata, é melhor deixar sem do que adivinhar errado.
- Retorne APENAS o texto formatado, sem nenhuma explicação antes ou depois.

Transcrição:
${textoCorrido}`;

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
        temperature: 0.2,
        max_completion_tokens: 2000,
      }),
    });
    const data = await groqRes.json();
    return data.choices?.[0]?.message?.content?.trim() || textoCorrido;
  } catch {
    // Se a formatação falhar por qualquer motivo, ainda devolve o texto cru
    // (já tratado no fluxo principal) em vez de travar tudo.
    return textoCorrido;
  }
}
