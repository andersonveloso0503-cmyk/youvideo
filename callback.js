import { google } from 'googleapis';

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Código de autorização ausente');

  const canal = state || 'apostolos';
  const nomeVar = canal === 'musica' ? 'YOUTUBE_REFRESH_TOKEN_MUSICA' : 'YOUTUBE_REFRESH_TOKEN';

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // O refresh_token só aparece na PRIMEIRA autorização (access_type=offline + prompt=consent).
    // Copie o valor mostrado abaixo e salve com o nome indicado nas variáveis
    // de ambiente do Vercel — ele é o que permite postar nesse canal sem
    // precisar logar de novo.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea;">
        <h2>Autorização concluída ✅ (canal: ${canal})</h2>
        <p>Copie o valor abaixo e salve no Vercel como <b>${nomeVar}</b>:</p>
        <textarea style="width:100%; height:80px;">${tokens.refresh_token || '(refresh_token não retornado — revogue o acesso em myaccount.google.com/permissions e tente de novo)'}</textarea>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Erro ao trocar código por token: ' + err.message);
  }
}
