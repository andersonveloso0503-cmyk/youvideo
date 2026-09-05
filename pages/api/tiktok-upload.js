export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoUrl, titulo, descricao } = req.body;

  if (!videoUrl) return res.status(400).json({ error: 'Vídeo final ainda não foi montado (etapa 4)' });

  if (!process.env.TIKTOK_REFRESH_TOKEN) {
    return res.status(500).json({
      error: 'TIKTOK_REFRESH_TOKEN não configurado. Acesse /api/auth/tiktok uma vez pra autorizar sua conta.',
    });
  }

  try {
    // 1. Renova o access token de curta duração usando o refresh token salvo.
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: process.env.TIKTOK_REFRESH_TOKEN,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      throw new Error(tokenData.error_description || 'Erro ao renovar token do TikTok');
    }
    const accessToken = tokenData.access_token;

    // 2. Baixa o vídeo montado pra saber o tamanho e poder subir pro TikTok.
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error('Não foi possível baixar o vídeo montado');
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const tamanho = videoBuffer.length;

    const legenda = [titulo, descricao].filter(Boolean).join(' — ') + ' #AIGC (conteúdo gerado por IA)';

    // 3. Inicia o post. Contas de app não auditado só conseguem postar em modo
    // privado (SELF_ONLY) — você aprova e publica de dentro do próprio app do TikTok.
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: legenda.slice(0, 2200),
          privacy_level: 'SELF_ONLY',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: tamanho,
          chunk_size: tamanho,
          total_chunk_count: 1,
        },
      }),
    });

    const initData = await initRes.json();
    if (!initRes.ok || initData.error?.code !== 'ok') {
      throw new Error(initData.error?.message || 'Erro ao iniciar publicação no TikTok');
    }

    const { publish_id, upload_url } = initData.data;

    // 4. Envia os bytes do vídeo pro TikTok.
    const uploadRes = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${tamanho - 1}/${tamanho}`,
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) throw new Error('Falha ao enviar o vídeo pro servidor do TikTok');

    return res.status(200).json({
      publishId: publish_id,
      status: 'enviado — abre o app do TikTok pra revisar (fica só visível pra você até você publicar manualmente)',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
