// Instagram SEM Página do Facebook ("API do Instagram com login do Instagram").
// Serve para contas novas que o Meta não deixa ligar a uma Página (ex.: Noites na História).
// O dono conecta uma vez em /instagram; a chave (60 dias) fica no Firestore e é renovada sozinha.
//
// Na Vercel: INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET (app do Meta → Instagram → "Configuração da API com login do Instagram").
import { getDb } from './firebase-admin';

const IG = 'https://graph.instagram.com';
const VERSAO = 'v21.0';
export const CONTAS_IG = { noites: 'Noites na História', games: 'Próxima Fase (games)' };
const doc = (conta) => getDb().collection('youvideo_central').doc(`instagram_${conta}`);

export const credenciaisIg = () => ({ id: String(process.env.INSTAGRAM_APP_ID || '').trim(), secret: String(process.env.INSTAGRAM_APP_SECRET || '').trim() });
export const redirectIg = (host) => process.env.INSTAGRAM_REDIRECT_URI || `https://${host}/api/auth/instagram-callback`;

/** Troca o código da autorização pela chave longa (60 dias) e guarda. */
export async function conectarIg(conta, code, host) {
  const c = credenciaisIg();
  const r = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, grant_type: 'authorization_code', redirect_uri: redirectIg(host), code: String(code).replace(/#_$/, '') }),
  });
  const curta = await r.json().catch(() => ({}));
  if (!r.ok || !curta.access_token) throw new Error(curta.error_message || curta.error?.message || `Instagram respondeu ${r.status}`);
  const l = await (await fetch(`${IG}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(c.secret)}&access_token=${encodeURIComponent(curta.access_token)}`)).json();
  if (!l.access_token) throw new Error(l.error?.message || 'O Instagram não devolveu a chave longa.');
  const eu = await (await fetch(`${IG}/${VERSAO}/me?fields=user_id,username&access_token=${encodeURIComponent(l.access_token)}`)).json();
  const dados = {
    token: l.access_token,
    userId: String(eu.user_id || curta.user_id || ''),
    usuario: eu.username || '',
    expiraEm: new Date(Date.now() + (Number(l.expires_in) || 5184000) * 1000).toISOString(),
    conectadoEm: new Date().toISOString(),
  };
  await doc(conta).set(dados);
  return dados;
}

/** Chave da conta (renova sozinha quando faltam menos de 10 dias). null = não conectada. */
export async function igConectado(conta) {
  if (!CONTAS_IG[conta]) return null;
  const g = (await doc(conta).get().catch(() => null))?.data();
  if (!g?.token) return null;
  if (new Date(g.expiraEm).getTime() - Date.now() < 10 * 86400e3) {
    try {
      const n = await (await fetch(`${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(g.token)}`)).json();
      if (n.access_token) {
        g.token = n.access_token;
        g.expiraEm = new Date(Date.now() + (Number(n.expires_in) || 5184000) * 1000).toISOString();
        await doc(conta).set(g, { merge: true });
      }
    } catch {
      /* usa a atual */
    }
  }
  return g;
}

export async function desconectarIg(conta) {
  await doc(conta).delete();
}

async function chamar(caminho, corpo, token) {
  const r = await fetch(`${IG}/${VERSAO}/${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, access_token: token }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Instagram respondeu ${r.status}: ${d.error?.message || JSON.stringify(d).slice(0, 200)}`);
  return d;
}

export async function criarContainerIg(conta, { tipo, midiaUrl, legenda }) {
  const g = await igConectado(conta);
  if (!g) throw new Error('O Instagram dessa conta ainda não está conectado. Abra o site, página /instagram, e clique em Conectar.');
  const corpo = tipo === 'video' ? { media_type: 'REELS', video_url: midiaUrl, caption: legenda } : { image_url: midiaUrl, caption: legenda };
  return (await chamar(`${g.userId}/media`, corpo, g.token)).id;
}

export async function statusContainerIg(conta, creationId) {
  const g = await igConectado(conta);
  const d = await (await fetch(`${IG}/${VERSAO}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(g?.token || '')}`)).json().catch(() => ({}));
  return { codigo: d.status_code || 'IN_PROGRESS', detalhe: d.status || '' };
}

export async function publicarContainerIg(conta, creationId) {
  const g = await igConectado(conta);
  return { id: (await chamar(`${g.userId}/media_publish`, { creation_id: creationId }, g.token)).id };
}
