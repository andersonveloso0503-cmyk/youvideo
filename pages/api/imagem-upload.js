import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      token: process.env.MEDIA_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Nada a fazer aqui — o front-end recebe a URL do blob diretamente
        // na resposta do upload() e segue o fluxo a partir dela.
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
