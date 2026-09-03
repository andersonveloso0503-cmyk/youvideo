export default async function handler(req, res) {
  const { taskId } = req.query;
  if (!taskId) return res.status(400).json({ error: 'Parâmetro taskId é obrigatório' });

  if (!process.env.KLING_API_KEY) {
    return res.status(500).json({ error: 'KLING_API_KEY não configurada' });
  }

  try {
    const statusRes = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { 'X-API-Key': process.env.KLING_API_KEY },
    });
    const statusData = await statusRes.json();
    if (!statusRes.ok) throw new Error(statusData.message || 'Erro ao consultar status da Kling');

    const info = statusData.data || statusData;

    if (info.status === 'completed' || info.status === 'success') {
      const videoUrl =
        info.output?.video_url ||
        info.output?.works?.[0]?.video?.resource_without_watermark ||
        info.output?.works?.[0]?.video?.resource;
      return res.status(200).json({ status: 'done', videoUrl: videoUrl || null });
    }
    if (info.status === 'failed') {
      return res.status(200).json({ status: 'failed', error: info.error?.message || 'Kling falhou' });
    }
    return res.status(200).json({ status: 'processing' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
