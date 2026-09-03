import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoUrl, thumbnailUrl, titulo, descricao, tags } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Vídeo final ainda não foi montado (etapa 4)' });
  }

  if (!process.env.YOUTUBE_REFRESH_TOKEN) {
    return res.status(500).json({
      error:
        'YOUTUBE_REFRESH_TOKEN não configurado. Acesse /api/auth/google uma vez, autorize sua conta e siga as instruções da tela final.',
    });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // TODO: baixar o vídeo de videoUrl como stream e passar em media.body abaixo.
    // Deixando a chamada pronta pra quando a etapa de montagem (Shotstack) estiver
    // retornando uma URL real de vídeo.
    /*
    const videoStream = await fetch(videoUrl).then(r => r.body);

    const uploadRes = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: titulo,
          description: descricao,
          tags,
        },
        status: {
          privacyStatus: 'private', // trocar pra 'public' depois de revisar
          selfDeclaredMadeForKids: false,
        },
      },
      media: { body: videoStream },
    });

    return res.status(200).json({ videoId: uploadRes.data.id });
    */

    return res.status(200).json({
      status: 'pendente: conectar o stream real do vídeo montado ao upload do YouTube',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
