export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização ausente');

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok || data.error) {
      throw new Error(data.error_description || data.error || 'Erro ao trocar código por token');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea;">
        <h2>Autorização do TikTok concluída ✅</h2>
        <p>Copie o valor abaixo e salve no Vercel como <b>TIKTOK_REFRESH_TOKEN</b>:</p>
        <textarea style="width:100%; height:80px;">${data.refresh_token || 'Não retornado — tente autorizar de novo'}</textarea>
        <p style="margin-top:20px; color:#999;">Esse token expira em cerca de 1 ano; o access_token de curta duração é renovado automaticamente pelo painel usando ele.</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Erro: ' + err.message);
  }
}
