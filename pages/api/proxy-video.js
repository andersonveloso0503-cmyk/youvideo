export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Parâmetro url é obrigatório' });

  try {
    const videoRes = await fetch(url);
    if (!videoRes.ok) throw new Error('Não foi possível baixar o vídeo original');

    res.setHeader('Content-Type', videoRes.headers.get('content-type') || 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buffer = Buffer.from(await videoRes.arrayBuffer());
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
