export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { arquivos, formato, duracaoAlvo } = req.body;
  if (!arquivos || !arquivos.length) return res.status(400).json({ error: 'Nenhuma imagem recebida' });

  if (!process.env.FAL_KEY) {
    return res.status(500).json({ error: 'FAL_KEY não configurada ainda.' });
  }

  try {
    const atualizados = [];
    for (const arquivo of arquivos) {
      if (!arquivo.imageUrl) {
        atualizados.push(arquivo);
        continue;
      }
      try {
        const { requestId, statusUrl, responseUrl } = await enviarParaKling(arquivo.imageUrl, arquivo.cena, formato, duracaoAlvo);
        atualizados.push({ ...arquivo, klingTaskId: requestId, statusUrl, responseUrl });
      } catch (err) {
        atualizados.push({ ...arquivo, avisoVideo: `Não deu pra animar (${err.message}); ficou só a imagem estática.` });
      }
    }
    return res.status(200).json({ arquivos: atualizados });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function enviarParaKling(imageUrl, descricaoCena, formato, duracaoAlvo) {
  const duracaoVideo = duracaoAlvo && duracaoAlvo > 5 ? 10 : 5;

  const submitRes = await fetch('https://fal.run/minimax/h3-max/image-to-video', {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: `${descricaoCena}, movimento de câmera sutil, cena viva mas estável`,
      image_url: imageUrl,
      duration: duracaoVideo,
      resolution: '768p',
    }),
  });

  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.detail || submitData.message || 'Erro ao enviar pedido à fal.ai');

  return {
    requestId: submitData.request_id,
    statusUrl: submitData.status_url || `https://queue.fal.run/minimax/h3-max/requests/${submitData.request_id}/status`,
    responseUrl: submitData.response_url || `https://queue.fal.run/minimax/h3-max/requests/${submitData.request_id}`,
  };
}
