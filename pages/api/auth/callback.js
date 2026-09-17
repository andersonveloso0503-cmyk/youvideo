import { google } from 'googleapis';
import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Código de autorização ausente');

  const canal = state || 'apostolos';

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res
        .status(400)
        .send('O Google não retornou um refresh_token. Revogue o acesso em myaccount.google.com/permissions e tente de novo.');
    }

    // Se "canal" bater com um documento real na coleção "canais" (canal
    // criado pelo wizard /novo-canal), salva o token automaticamente no
    // Firestore e volta pro wizard — sem precisar copiar/colar nada.
    const db = getDb();
    const canalRef = db.collection('canais').doc(canal);
    const canalSnap = await canalRef.get();

    if (canalSnap.exists) {
      await canalRef.set(
        {
          youtubeRefreshToken: tokens.refresh_token,
          youtubeConectadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
      return res.redirect(`/novo-canal?canalId=${canal}&youtube=conectado`);
    }

    // Caso contrário, é um dos canais antigos (apostolos/musica) que ainda
    // usa variável de ambiente fixa — mantém o comportamento manual de sempre.
    const nomeVar = canal === 'musica' ? 'YOUTUBE_REFRESH_TOKEN_MUSICA' : 'YOUTUBE_REFRESH_TOKEN';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea;">
        <h2>Autorização concluída ✅ (canal: ${canal})</h2>
        <p>Copie o valor abaixo e salve no Vercel como <b>${nomeVar}</b>:</p>
        <textarea style="width:100%; height:80px;">${tokens.refresh_token}</textarea>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Erro ao trocar código por token: ' + err.message);
  }
}
