// GET /api/central/canais-youtube?token=CENTRAL_TOKEN
// Mostra em qual canal do YouTube cada autorização da Vercel está publicando.
import { google } from 'googleapis';
import { exigirToken } from '../../../lib/central';

const VARIAVEIS = [
  ['YOUTUBE_REFRESH_TOKEN', 'Vídeos bíblicos: vídeo narrado, histórias animadas, cortes cômicos, orações e a fila automática'],
  ['YOUTUBE_REFRESH_TOKEN_MUSICA', 'Música: /musica, fila de músicas e medley'],
];

async function canalDoToken(refreshToken) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  auth.setCredentials({ refresh_token: refreshToken });
  const r = await google.youtube({ version: 'v3', auth }).channels.list({ part: ['snippet'], mine: true });
  const c = r.data.items?.[0];
  return c ? { canal: c.snippet.title, id: c.id, link: `https://www.youtube.com/channel/${c.id}` } : { canal: '(essa conta não tem canal)' };
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const resultado = [];
  for (const [nome, usadoPor] of VARIAVEIS) {
    const token = process.env[nome];
    if (!token) {
      resultado.push({ variavel: nome, usadoPor, canal: '(não configurado)' });
      continue;
    }
    try {
      resultado.push({ variavel: nome, usadoPor, ...(await canalDoToken(token)) });
    } catch (e) {
      resultado.push({ variavel: nome, usadoPor, canal: '(autorização inválida ou expirada)', erro: e.message });
    }
  }
  if (/text\/html/.test(req.headers.accept || '')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<body style="font-family:sans-serif;background:#15130f;color:#f2ece0;padding:30px;max-width:760px">
      <h2>Em qual canal o Youvideo (site) publica</h2>
      ${resultado
        .map(
          (r) => `<div style="border:1px solid #332c20;border-radius:10px;padding:14px;margin:10px 0">
          <div style="color:#9c8f79;font-size:13px">${r.usadoPor}</div>
          <div style="font-size:20px;font-weight:700;margin:6px 0">${r.link ? `<a style="color:#d9a441" href="${r.link}">${r.canal}</a>` : r.canal}</div>
          <code style="color:#9c8f79">${r.variavel}</code>${r.erro ? `<div style="color:#e89a88">${r.erro}</div>` : ''}</div>`
        )
        .join('')}
    </body>`);
  }
  return res.status(200).json({ resultado });
}
