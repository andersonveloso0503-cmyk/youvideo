export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cenas, estilo } = req.body;
  if (!cenas || !cenas.length) return res.status(400).json({ error: 'Nenhuma cena recebida' });

  if (!process.env.FLUX_API_KEY || !process.env.KLING_API_KEY) {
    return res.status(500).json({
      error:
        'FLUX_API_KEY e/ou KLING_API_KEY não configuradas ainda. Crie conta em cada serviço e adicione as chaves no Vercel.',
    });
  }

  const estiloPrompt =
    estilo === 'desenho'
      ? 'estilo desenho animado, cores vibrantes, traço consistente'
      : 'estilo realista, cinematográfico, iluminação natural';

  try {
    const arquivos = [];

    for (const cena of cenas) {
      const promptFinal = `${cena.descricao}, ${estiloPrompt}, personagens bíblicos consistentes com a série`;

      // TODO: chamar a API da Flux aqui com promptFinal para gerar a imagem-base da cena
      // TODO: em seguida chamar a API da Kling usando a imagem gerada para animar (image-to-video)
      arquivos.push({
        cena: cena.descricao,
        prompt: promptFinal,
        status: 'pendente: integrar chamada real à Flux/Kling',
      });
    }

    return res.status(200).json({ arquivos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
