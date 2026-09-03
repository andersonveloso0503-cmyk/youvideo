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
    }, composição chamativa, texto grande e legível, alto contraste, sem elementos enganosos`;

    // TODO: chamar a API da Flux aqui com esse prompt e retornar a URL da imagem gerada

    return res.status(200).json({
      imageUrl: null,
      prompt,
      status: 'pendente: integrar chamada real à Flux',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
