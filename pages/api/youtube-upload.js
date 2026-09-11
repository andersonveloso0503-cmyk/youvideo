import { google } from 'googleapis';
import { Readable } from 'stream';

// Cada canal autorizado tem o próprio refresh token, salvo numa variável de
// ambiente diferente no Vercel — assim dá pra publicar em canais diferentes
// sem misturar as contas.
function nomeVariavelRefreshToken(canal) {
  return canal === 'musica' ? 'YOUTUBE_REFRESH_TOKEN_MUSICA' : 'YOUTUBE_REFRESH_TOKEN';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoUrl, thumbnailUrl, titulo, descricao, tags, canal } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: 'Vídeo final ainda não foi montado (etapa 4)' });
  }

  const nomeVar = nomeVariavelRefreshToken(canal);
  const refreshToken = process.env[nomeVar];

  if (!refreshToken) {
    return res.status(500).json({
      error: `${nomeVar} não configurado. Acesse /api/auth/google?canal=${canal || 'apostolos'} uma vez, autorize a conta desse canal e siga as instruções da tela final.`,
    });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const listaTags = tags && tags.length ? tags : [];
    const hashtags = listaTags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
    const LIMITE_DESCRICAO_YOUTUBE = 4900; // deixa uma margem do limite real de 5000
    let descricaoCortada = descricao || '';
    if (descricaoCortada.length > LIMITE_DESCRICAO_YOUTUBE) {
      descricaoCortada = descricaoCortada.slice(0, LIMITE_DESCRICAO_YOUTUBE) + '\n\n(...)';
    }
    const descricaoFinal = [descricaoCortada, '', hashtags].filter(Boolean).join('\n');

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok || !videoRes.body) {
      throw new Error('Não foi possível baixar o vídeo montado a partir da URL da Shotstack');
    }

    const uploadRes = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: titulo || 'Vídeo Youvideo',
          description: descricaoFinal,
          tags: listaTags,
        },
        status: {
          privacyStatus: 'private', // trocar pra 'public' depois de revisar manualmente
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: true,
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
