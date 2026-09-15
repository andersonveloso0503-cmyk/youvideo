export default async function handler(req, res) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SHOTSTACK_API_KEY não configurada' });

  // Um render minúsculo e simples (texto por 3 segundos), só pra ver a
  // resposta crua da Shotstack sem nenhuma complexidade do pipeline real
  // no meio (sem áudio, sem imagens, sem legendas).
  const timeline = {
    background: '#000000',
    tracks: [
      {
        clips: [
          {
            asset: { type: 'title', text: 'Teste Youvideo', style: 'minimal' },
            start: 0,
            length: 3,
          },
        ],
      },
    ],
  };
  const output = { format: 'mp4', resolution: 'sd' };

  try {
    const renderRes = await fetch('https://api.shotstack.io/edit/v1/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ timeline, output }),
    });

    const texto = await renderRes.text();
    let data;
    try {
      data = JSON.parse(texto);
    } catch {
      data = { respostaNaoJson: texto };
    }

    return res.status(200).json({
      statusCodeDaShotstack: renderRes.status,
      requestIdHeader: renderRes.headers.get('x-request-id') || renderRes.headers.get('request-id') || null,
      todosOsHeaders: Object.fromEntries(renderRes.headers.entries()),
      corpoCompleto: data,
    });
  } catch (err) {
    return res.status(500).json({ erroDeRede: err.message });
  }
}
