// Começa a conexão do Instagram pelo login do Instagram (sem Página do Facebook).
//   /api/auth/instagram?token=SENHA&conta=noites
import { randomBytes } from 'crypto';
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { credenciaisIg, redirectIg, CONTAS_IG } from '../../../lib/instagramLogin';

export default async function handler(req, res) {
  const pagina = (texto) =>
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<div style="font-family:sans-serif;padding:40px;background:#15130f;color:#f3ead9"><h2>Não deu para começar</h2><p>${texto}</p><p><a style="color:#d9a441" href="/instagram">← Voltar</a></p></div>`);
  if (!autorizado(req).ok) return pagina('Abra a conexão pela página <b>/instagram</b>, com a senha da Central.');
  const conta = String(req.query.conta || '');
  if (!CONTAS_IG[conta]) return pagina('Conta desconhecida.');
  const { id } = credenciaisIg();
  if (!id) return pagina('Falta INSTAGRAM_APP_ID na Vercel (veja o passo 1 na página /instagram).');
  const state = randomBytes(16).toString('hex');
  await getDb().collection('youvideo_central').doc('instagram_state').set({ state, conta, em: new Date().toISOString() });
  const params = new URLSearchParams({
    force_reauth: 'true', // sempre pede o login: assim dá para escolher a conta certa de cada canal
    client_id: id,
    redirect_uri: redirectIg(req.headers.host),
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state,
  });
  console.log(`[instagram-auth] conta=${conta} client_id termina em ...${id.slice(-4)} (${id.length} dígitos) redirect_uri=${redirectIg(req.headers.host)}`);
  res.redirect(`https://www.instagram.com/oauth/authorize?${params.toString()}`);
}
