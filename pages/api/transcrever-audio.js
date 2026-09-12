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

    return res.status(200).json({ texto: transData.text || '' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
