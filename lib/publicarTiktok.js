// lib/publicarTiktok.js
// Envia um vídeo para o TikTok. Enquanto o app não for aprovado (auditado) pelo
// TikTok, o post entra como privado (SELF_ONLY) e você libera pelo app do TikTok.

async function tokenTiktok() {
  if (!process.env.TIKTOK_REFRESH_TOKEN) throw new Error('TIKTOK_REFRESH_TOKEN não configurado (autorize em /api/auth/tiktok).');
  const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.TIKTOK_REFRESH_TOKEN,
    }),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error_description || 'Erro ao renovar o token do TikTok');
  return d.access_token;
}

export async function publicarNoTiktok({ videoUrl, legenda }) {
  const accessToken = await tokenTiktok();
  const v = await fetch(videoUrl);
  if (!v.ok) throw new Error('Não foi possível baixar o vídeo para o TikTok');
  const buf = Buffer.from(await v.arrayBuffer());
  const tamanho = buf.length;
  // O TikTok aceita pedaços de 5 a 64 MB; vídeo pequeno vai inteiro
  const PEDACO = 20 * 1024 * 1024;
  const total = tamanho <= 64 * 1024 * 1024 ? 1 : Math.floor(tamanho / PEDACO);
  const tamPedaco = total === 1 ? tamanho : PEDACO;

  const init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: String(legenda || '').slice(0, 2200),
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: tamanho, chunk_size: tamPedaco, total_chunk_count: total },
    }),
  });
  const d = await init.json();
  if (!init.ok || d.error?.code !== 'ok') throw new Error(d.error?.message || 'Erro ao iniciar publicação no TikTok');
  const { publish_id, upload_url } = d.data;

  for (let i = 0; i < total; i++) {
    const ini = i * tamPedaco;
    const fim = i === total - 1 ? tamanho - 1 : ini + tamPedaco - 1;
    const up = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${ini}-${fim}/${tamanho}` },
      body: buf.subarray(ini, fim + 1),
    });
    if (!up.ok) throw new Error(`Falha ao enviar o vídeo para o TikTok (${up.status})`);
  }
  return { id: publish_id, url: null, obs: 'Entrou como privado — libere pelo app do TikTok' };
}
