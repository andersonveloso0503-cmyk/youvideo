export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Termo de busca é obrigatório' });

  if (!process.env.PEXELS_API_KEY) {
    return res.status(500).json({
      error: 'PEXELS_API_KEY não configurada ainda. Crie conta em pexels.com/api e adicione no Vercel.',
    });
  }

  try {
    const searchRes = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    const data = await searchRes.json();
    if (!searchRes.ok) throw new Error(data.error || 'Erro na Pexels');

    const resultados = (data.videos || []).map((v) => ({
      id: v.id,
      preview: v.image,
      videoUrl: v.video_files?.[0]?.link,
    }));

    return res.status(200).json({ resultados });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
