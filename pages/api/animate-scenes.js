export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { arquivos, formato, duracaoAlvo, loop } = req.body;
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
        const { requestId, statusUrl, responseUrl } = await enviarParaKling(arquivo.imageUrl, arquivo.cena, formato, duracaoAlvo, !!loop);
        // Sem restos de uma animação anterior (senão a tela acha que já terminou)
        const { videoUrl, falhouAnimacao, avisoVideo, ...limpo } = arquivo;
        atualizados.push({ ...limpo, klingTaskId: requestId, statusUrl, responseUrl, videoLoop: !!loop });
      } catch (err) {
        atualizados.push({ ...arquivo, avisoVideo: `Não deu pra animar (${err.message}); ficou só a imagem estática.` });
      }
    }
    return res.status(200).json({ arquivos: atualizados });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// loop = o clipe começa e termina no MESMO quadro (a própria imagem da cena).
// Assim a montagem pode repetir o clipe pelo tempo todo da cena, emendando
// sem pulo — a cena fica em movimento do começo ao fim, sem imagem parada,
// e custa o mesmo (1 animação por cena).
async function enviarParaKling(imageUrl, descricaoCena, formato, duracaoAlvo, loop) {
  const submitRes = await fetch('https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/turbo', {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: loop
        ? `${descricaoCena}. Animação viva e contínua: personagens se mexem de forma natural (gestos, respiração, olhares, cabelo e roupas balançando com o vento), elementos do cenário em movimento (folhas, água, nuvens, fogo, poeira de luz), câmera se movendo devagar. O movimento vai e volta suavemente e termina na mesma posição do início.`
        : `${descricaoCena}, movimento de câmera sutil, cena viva mas estável`,
      image_url: imageUrl,
      ...(loop ? { end_image_url: imageUrl } : {}),
      ...(formato === 'short' ? { aspect_ratio: '9:16' } : formato ? { aspect_ratio: '16:9' } : {}),
      resolution: '720p',
    }),
  });

  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.detail || submitData.message || 'Erro ao enviar pedido à fal.ai');

  return {
    requestId: submitData.request_id,
    statusUrl: submitData.status_url || `https://queue.fal.run/fal-ai/wan/requests/${submitData.request_id}/status`,
    responseUrl: submitData.response_url || `https://queue.fal.run/fal-ai/wan/requests/${submitData.request_id}`,
  };
}
