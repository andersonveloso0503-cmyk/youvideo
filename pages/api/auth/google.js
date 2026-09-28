import { google } from 'googleapis';

export default function handler(req, res) {
  const { canal } = req.query;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    // select_account obriga o Google a mostrar a escolha de conta/canal (senão ele pega o último usado)
    prompt: 'consent select_account',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    // Carrega qual canal está sendo autorizado até o callback, pra saber em
    // qual variável de ambiente salvar o refresh token gerado.
    state: canal || 'apostolos',
  });

  res.redirect(url);
}
