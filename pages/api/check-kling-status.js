export default async function handler(req, res) {
  const { statusUrl, responseUrl } = req.query;
  if (!statusUrl || !responseUrl) {
    return res.status(400).json({ error: 'Parâmetros statusUrl e responseUrl são obrigatórios' });
  }

  if (!process.env.FAL_KEY) {
    return res.status(500).json({ error: 'FAL_KEY não configurada' });
  }

  try {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${process.env.FAL_KEY}` },
    });
    const statusData = await statusRes.json();
    if (!statusRes.ok) throw new Error(statusData.detail || 'Erro ao consultar status da fal.ai');

    if (statusData.status === 'COMPLETED') {
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${process.env.FAL_KEY}` },
      });
      const resultData = await resultRes.json();
      if (!resultRes.ok) throw new Error(resultData.detail || 'Erro ao buscar o vídeo pronto');

      const videoUrl = resultData.video?.url || resultData.data?.video?.url || null;
      return res.status(200).json({ status: 'done', videoUrl });
    }

    if (statusData.status === 'ERROR' || statusData.status === 'FAILED') {
      return res.status(200).json({ status: 'failed', error: statusData.error || 'Falha na geração' });
    }

    return res.status(200).json({ status: 'processing' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
