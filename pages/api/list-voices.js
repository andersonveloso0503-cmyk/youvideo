export default async function handler(req, res) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY não configurada' });
  }

  try {
    const vozesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });
    const data = await vozesRes.json();
    if (!vozesRes.ok) throw new Error(data.detail?.message || 'Erro ao listar vozes');

    const vozes = (data.voices || []).map((v) => ({
      id: v.voice_id,
      nome: v.name,
      genero: v.labels?.gender || '',
      sotaque: v.labels?.accent || '',
      preview: v.preview_url || null,
    }));

    return res.status(200).json({ vozes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
