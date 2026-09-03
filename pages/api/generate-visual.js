export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cenas, estilo } = req.body;
  if (!cenas || !cenas.length) return res.status(400).json({ error: 'Nenhuma cena recebida' });

  if (!process.env.FLUX_API_KEY) {
    return res.status(500).json({
      error: 'FLUX_API_KEY não configurada ainda. Crie conta em dashboard.bfl.ai e adicione no Vercel.',
    });
  }

  const estiloPrompt =
    estilo === 'desenho'
      ? 'estilo desenho animado, cores vibrantes, traço consistente, ilustração 2D'
      : 'estilo realista, cinematográfico, iluminação natural, fotografia dramática';

  try {
    const arquivos = [];

    for (const cena of cenas) {
      const promptFinal = `${cena.descricao}, ${estiloPrompt}, personagens bíblicos, composição de cena de vídeo, alta qualidade`;

      const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'x-key': process.env.FLUX_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: promptFinal, width: 1344, height: 768 }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

      const pollingUrl = submitData.polling_url;
      let imageUrl = null;
      let tentativas = 0;

      while (tentativas < 45) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollRes = await fetch(pollingUrl, { headers: { 'x-key': process.env.FLUX_API_KEY } });
        const pollData = await pollRes.json();

        if (pollData.status === 'Ready') {
          imageUrl = pollData.result?.sample;
          break;
        }
        if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) {
          throw new Error(`Geração falhou: ${pollData.status} (cena: "${cena.descricao}")`);
        }
        tentativas++;
      }

      if (!imageUrl) throw new Error(`Tempo esgotado esperando a imagem da cena "${cena.descricao}"`);

      const arquivo = { cena: cena.descricao, imageUrl };

      // Se a Kling estiver configurada, só ENVIA o pedido de animação (não espera
      // terminar aqui, pra não estourar o limite de 60s do Vercel). O painel
      // consulta o andamento depois em /api/check-kling-status.
      if (process.env.KLING_API_KEY) {
        try {
          arquivo.klingTaskId = await enviarParaKling(imageUrl, cena.descricao);
        } catch (err) {
          arquivo.avisoVideo = `Não deu pra enviar essa cena pra animação (${err.message}); ficou só a imagem estática.`;
        }
      }

      arquivos.push(arquivo);
    }

    return res.status(200).json({ arquivos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function enviarParaKling(imageUrl, descricaoCena) {
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
        mode: 'std',
        duration: 5,
        aspect_ratio: '16:9',
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
