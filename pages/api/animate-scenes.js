export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { arquivos, formato, duracaoAlvo } = req.body;
  if (!arquivos || !arquivos.length) return res.status(400).json({ error: 'Nenhuma imagem recebida' });

  if (!process.env.KLING_API_KEY) {
    return res.status(500).json({ error: 'KLING_API_KEY não configurada ainda.' });
  }

  try {
    const atualizados = [];
    for (const arquivo of arquivos) {
      if (!arquivo.imageUrl) {
        atualizados.push(arquivo);
        continue;
      }
      try {
        const klingTaskId = await enviarParaKling(arquivo.imageUrl, arquivo.cena, formato, duracaoAlvo);
        atualizados.push({ ...arquivo, klingTaskId });
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
  const duracaoKling = duracaoAlvo && duracaoAlvo > 5 ? 10 : 5;

  const submitRes = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.KLING_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kling',
      task_type: 'video_generation',
      input: {
        version: '2.6',
        mode: 'pro',
        duration: duracaoKling,
        aspect_ratio: formato === 'short' ? '9:16' : '16:9',
        image_url: imageUrl,
        prompt: `${descricaoCena}, movimento de câmera sutil, cena viva mas estável`,
      },
    }),
  });

  const submitData = await submitRes.json();
  if (!submitRes.ok) throw new Error(submitData.message || 'Erro ao enviar pedido à Kling');

  const taskId = submitData.data?.task_id || submitData.task_id;
  if (!taskId) throw new Error('Kling não retornou um task_id');
  return taskId;
}
