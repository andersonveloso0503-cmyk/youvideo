import { google } from 'googleapis';
import { Readable } from 'stream';

// Cada canal autorizado tem o próprio refresh token, salvo numa variável de
// ambiente diferente no Vercel — assim dá pra publicar em canais diferentes
// sem misturar as contas.
function nomeVariavelRefreshToken(canal) {
  return canal === 'musica' ? 'YOUTUBE_REFRESH_TOKEN_MUSICA' : 'YOUTUBE_REFRESH_TOKEN';
}

function gerarSRT(palavras) {
  if (!palavras || !palavras.length) return null;
  const paraTempo = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    const ms = String(Math.round((s % 1) * 1000)).padStart(3, '0');
    return `${h}:${m}:${sec},${ms}`;
  };
  const TAMANHO_BLOCO = 8;
  const validas = palavras.filter((p) => p.start != null && p.end != null && p.end > p.start);
  const blocos = [];
  for (let i = 0; i < validas.length; i += TAMANHO_BLOCO) blocos.push(validas.slice(i, i + TAMANHO_BLOCO));
  return blocos
    .map((bloco, idx) => {
      const inicio = bloco[0].start;
      const fim = bloco[bloco.length - 1].end;
      const texto = bloco.map((p) => p.texto).join(' ');
      return `${idx + 1}\n${paraTempo(inicio)} --> ${paraTempo(fim)}\n${texto}\n`;
    })
    .join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoUrl, thumbnailUrl, titulo, descricao, tags, canal, palavras } = req.body;

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

    // Sobe uma legenda .srt real a partir do timing de palavras que já
    // temos. Com uma faixa oficial existente, o YouTube deixa de rodar a
    // própria legenda automática por cima do texto que já queimamos no
    // vídeo (evita a duplicação visual que aparece no player desktop).
    const srt = gerarSRT(palavras);
    if (srt) {
      try {
        await youtube.captions.insert({
          part: ['snippet'],
          requestBody: { snippet: { videoId, language: 'pt', name: 'Português', isDraft: false } },
          media: { mimeType: 'application/octet-stream', body: srt },
        });
      } catch {
        // Não trava o upload principal se a legenda falhar — o vídeo já subiu.
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
