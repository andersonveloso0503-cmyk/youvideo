// Recebe o token de upload direto do navegador para o Vercel Blob
// (permite subir músicas grandes, acima do limite de 4,5 MB da Vercel)
import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
          'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm',
        ],
        maximumSizeInBytes: 60 * 1024 * 1024, // 60 MB
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (e) {
    return res.status(400).json({ erro: e.message });
  }
}
