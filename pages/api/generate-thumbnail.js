export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, titulo, estilo } = req.body;

  if (!process.env.FLUX_API_KEY) {
    return res.status(500).json({
      error: 'FLUX_API_KEY não configurada ainda.',
    });
  }

  try {
    const prompt = `Thumbnail de YouTube para vídeo sobre "${titulo || tema}", ${
      estilo === 'desenho' ? 'estilo desenho animado' : 'estilo realista cinematográfico'
    }, composição chamativa, alto contraste, close no personagem principal, sem texto sobreposto`;

    const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-key': process.env.FLUX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, width: 1280, height: 720 }),
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

    const pollingUrl = submitData.polling_url;
    let imageUrl = null;
    let tentativas = 0;

    while (tentativas < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(pollingUrl, { headers: { 'x-key': process.env.FLUX_API_KEY } });
      const pollData = await pollRes.json();

      if (pollData.status === 'Ready') {
        imageUrl = pollData.result?.sample;
        break;
      }
      if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) {
        throw new Error(`Geração falhou: ${pollData.status}`);
      }
      tentativas++;
    }

    if (!imageUrl) throw new Error('Tempo esgotado esperando a thumbnail');

    return res.status(200).json({ imageUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
