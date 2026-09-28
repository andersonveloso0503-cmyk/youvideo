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
    // Mostra EM QUAL CANAL essa autorização vai publicar, pra não salvar o canal errado
    let nomeCanal = '(não consegui ler o nome do canal)';
    try {
      oauth2Client.setCredentials(tokens);
      const r = await google.youtube({ version: 'v3', auth: oauth2Client }).channels.list({ part: ['snippet'], mine: true });
      nomeCanal = r.data.items?.[0]?.snippet?.title || '(essa conta não tem canal do YouTube)';
    } catch {}
    const esperado = canal === 'musica' ? 'o canal de música' : 'o canal Em Nome de Jesus (vídeos bíblicos)';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea; max-width:760px">
        <h2>Autorização concluída ✅</h2>
        <p>Esta autorização vai publicar no canal:</p>
        <p style="font-size:28px;font-weight:800;color:#d9a441;margin:6px 0 18px">${nomeCanal}</p>
        <p style="background:#2a1d10;border:1px solid #d9a441;border-radius:8px;padding:10px">Era para ser <b>${esperado}</b>. Se o nome acima estiver errado, <b>não salve</b>: troque de canal no YouTube e abra <a style="color:#d9a441" href="/api/auth/google?canal=${canal}">este link</a> de novo.</p>
        <p>Se estiver certo, copie o valor abaixo e salve na Vercel como <b>${nomeVar}</b> (depois faça Redeploy):</p>
        <textarea style="width:100%; height:80px;">${tokens.refresh_token}</textarea>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Erro ao trocar código por token: ' + err.message);
  }
}
