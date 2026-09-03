import { google } from 'googleapis';

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização ausente');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // O refresh_token só aparece na PRIMEIRA autorização (access_type=offline + prompt=consent).
    // Copie o valor mostrado abaixo e salve como YOUTUBE_REFRESH_TOKEN nas variáveis
    // de ambiente do Vercel — ele é o que permite postar no canal sem você logar de novo.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea;">
        <h2>Autorização concluída ✅</h2>
        <p>Copie o valor abaixo e salve no Vercel como <b>YOUTUBE_REFRESH_TOKEN</b>:</p>
        <textarea style="width:100%; height:80px;">${tokens.refresh_token || '(refresh_token não retornado — revogue o acesso em myaccount.google.com/permissions e tente de novo)'}</textarea>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Erro ao trocar código por token: ' + err.message);
  }
}
