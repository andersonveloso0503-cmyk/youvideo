import { google } from 'googleapis';
import { Readable } from 'stream';

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

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok || !videoRes.body) {
      throw new Error('Não foi possível baixar o vídeo montado a partir da URL da Shotstack');
    }

    const uploadRes = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: titulo || 'Vídeo Youvideo',
          description: descricao || '',
          tags: tags || [],
        },
        status: {
          privacyStatus: 'private', // trocar pra 'public' depois de revisar manualmente
          selfDeclaredMadeForKids: false,
        },
      },
      media: { body: Readable.fromWeb(videoRes.body) },
    });

    const videoId = uploadRes.data.id;

    // Sobe a thumbnail personalizada, se já tiver sido gerada.
    if (thumbnailUrl) {
      try {
        const thumbRes = await fetch(thumbnailUrl);
        if (thumbRes.ok && thumbRes.body) {
          await youtube.thumbnails.set({ videoId, media: { body: Readable.fromWeb(thumbRes.body) } });
        }
      } catch {
        // Não trava o upload principal se a thumbnail falhar — o vídeo já subiu.
      }
    }

    return res.status(200).json({
      videoId,
      status: 'privado no YouTube — revise e publique manualmente quando quiser',
      link: `https://studio.youtube.com/video/${videoId}/edit`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
