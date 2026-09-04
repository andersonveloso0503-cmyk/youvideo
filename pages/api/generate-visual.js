export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cenas, estilo, formato, duracaoAlvo } = req.body;
  if (!cenas || !cenas.length) return res.status(400).json({ error: 'Nenhuma cena recebida' });

  if (!process.env.FLUX_API_KEY) {
    return res.status(500).json({
      error: 'FLUX_API_KEY não configurada ainda. Crie conta em dashboard.bfl.ai e adicione no Vercel.',
    });
  }

  const estiloPrompt =
    estilo === 'desenho'
      ? 'estilo desenho animado, cores vibrantes, traço consistente, ilustração 2D'
      : 'fotografia hiper-realista, foto tirada com câmera DSLR, lente 85mm, profundidade de campo rasa, textura de pele natural com poros visíveis, iluminação cinematográfica dramática, grão de filme sutil, 8K, ultra detalhado, NÃO parece pintura nem ilustração digital';

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
        body: JSON.stringify({
          prompt: promptFinal,
          width: formato === 'short' ? 768 : 1344,
          height: formato === 'short' ? 1344 : 768,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

      const pollingUrl = submitData.polling_url;
      let imageUrl = null;
      let bloqueada = false;
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
          bloqueada = true;
          break;
        }
        tentativas++;
      }

      if (bloqueada) {
        arquivos.push({
          cena: cena.descricao,
          erro: 'Essa cena foi barrada pelo filtro de conteúdo da Flux e foi pulada.',
        });
        continue;
      }

      if (!imageUrl) throw new Error(`Tempo esgotado esperando a imagem da cena "${cena.descricao}"`);

      const arquivo = { cena: cena.descricao, textoNarrado: cena.textoNarrado || '', imageUrl };
      arquivos.push(arquivo);
    }

    return res.status(200).json({ arquivos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
