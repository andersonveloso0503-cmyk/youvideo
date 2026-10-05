// TikTok pelo aplicativo próprio do Youvideo (developers.tiktok.com).
//
// O que o TikTok deixa um aplicativo SEM auditoria fazer:
//  - "Rascunho": manda o vídeo para dentro do TikTok da conta conectada. O dono toca no aviso
//    ("vídeo pronto para editar"), cola a legenda e publica. É o que usamos no dia a dia.
//  - "Postagem direta": só entra como PRIVADO e exige a conta privada. Não serve para canal público.
// Postagem direta pública só com o aplicativo auditado pelo TikTok — e eles não aprovam
// ferramenta de uso próprio.
//
// A conexão (refresh token) fica guardada no Firestore, não em variável da Vercel:
// o dono clica em "Conectar" na página /tiktok e pronto.
import { getDb } from './firebase-admin';

const API = 'https://open.tiktokapis.com';
const doc = () => getDb().collection('youvideo_central').doc('tiktok');

export function chavesTiktok() {
  return { key: !!process.env.TIKTOK_CLIENT_KEY, secret: !!process.env.TIKTOK_CLIENT_SECRET };
}

export function redirectTiktok(host) {
  return process.env.TIKTOK_REDIRECT_URI || `https://${host}/api/auth/tiktok-callback`;
}

async function guardado() {
  const d = await doc().get();
  return d.exists ? d.data() : {};
}

/** Guarda o que o TikTok devolveu na autorização ou na renovação. */
export async function salvarTokensTiktok(d, extra = {}) {
  const dados = {
    refreshToken: d.refresh_token,
    accessToken: d.access_token || null,
    expiraEm: d.expires_in ? new Date(Date.now() + (Number(d.expires_in) - 300) * 1000).toISOString() : null,
    escopos: String(d.scope || ''),
    openId: d.open_id || null,
    atualizadoEm: new Date().toISOString(),
    ...extra,
  };
  if (!dados.refreshToken) throw new Error('O TikTok não devolveu a autorização. Tente conectar de novo.');
  await doc().set(dados, { merge: true });
  return dados;
}

export async function desconectarTiktok() {
  await doc().delete();
}

/** A conta está conectada? (sem chamar o TikTok) */
export async function tiktokConectado() {
  const g = await guardado().catch(() => ({}));
  return !!(g.refreshToken || process.env.TIKTOK_REFRESH_TOKEN);
}

async function tokenTiktok() {
  const g = await guardado();
  if (g.accessToken && g.expiraEm && g.expiraEm > new Date().toISOString()) return { token: g.accessToken, escopos: g.escopos || '' };
  const refresh = g.refreshToken || process.env.TIKTOK_REFRESH_TOKEN;
  if (!refresh) throw new Error('O TikTok ainda não está conectado. Abra a página /tiktok e clique em Conectar.');
  const r = await fetch(`${API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(`O TikTok não renovou a conexão (${d.error_description || d.error || r.status}). Clique em Conectar de novo na página /tiktok.`);
  // O TikTok pode trocar o refresh token a cada renovação: guarda sempre o mais novo
  const salvo = await salvarTokensTiktok({ ...d, refresh_token: d.refresh_token || refresh });
  return { token: salvo.accessToken, escopos: salvo.escopos };
}

async function chamar(caminho, corpo) {
  const { token } = await tokenTiktok();
  const r = await fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(corpo || {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.error && d.error.code && d.error.code !== 'ok')) {
    const e = new Error(traduzirErro(d.error?.code, d.error?.message) || `TikTok respondeu ${r.status}`);
    e.codigo = d.error?.code || String(r.status);
    throw e;
  }
  return d.data || {};
}

function traduzirErro(codigo, mensagem) {
  const mapa = {
    spam_risk_too_many_pending_share: 'O TikTok só aceita 5 rascunhos esperando por dia. Publique os que já estão lá (aviso dentro do TikTok) e tente de novo.',
    spam_risk_too_many_posts: 'O TikTok bloqueou por excesso de posts hoje. Tente amanhã.',
    spam_risk_user_banned_from_posting: 'A conta do TikTok está impedida de postar no momento.',
    scope_not_authorized: 'A conexão não tem essa permissão. Clique em Conectar de novo na página /tiktok e aceite todas as permissões.',
    access_token_invalid: 'A conexão com o TikTok venceu. Clique em Conectar de novo na página /tiktok.',
    unaudited_client_can_only_post_to_private_accounts: 'Postagem direta só funciona com a conta privada enquanto o aplicativo não é auditado. Use o envio como rascunho.',
    url_ownership_unverified: 'O TikTok pede a verificação do endereço do vídeo.',
    rate_limit_exceeded: 'Muitos pedidos ao TikTok em pouco tempo. Tente de novo em 1 minuto.',
  };
  return mapa[codigo] || (mensagem ? `TikTok: ${mensagem}` : codigo ? `TikTok: ${codigo}` : '');
}

/** Dados da conta conectada (nome e o que ela pode postar). Precisa da permissão de postagem (video.publish). */
export async function contaTiktok() {
  const d = await chamar('/v2/post/publish/creator_info/query/');
  return {
    nome: d.creator_nickname || '',
    usuario: d.creator_username || '',
    foto: d.creator_avatar_url || null,
    privacidades: d.privacy_level_options || [],
    duracaoMaxSeg: d.max_video_post_duration_sec || null,
  };
}

async function baixarVideo(videoUrl) {
  const v = await fetch(videoUrl);
  if (!v.ok) throw new Error('Não consegui baixar o vídeo para mandar ao TikTok');
  return Buffer.from(await v.arrayBuffer());
}

// O TikTok aceita pedaços de 5 a 64 MB; vídeo de até 64 MB vai inteiro
function pedacos(tamanho) {
  const PEDACO = 20 * 1024 * 1024;
  const total = tamanho <= 64 * 1024 * 1024 ? 1 : Math.floor(tamanho / PEDACO);
  return { total, tamPedaco: total === 1 ? tamanho : PEDACO };
}

async function subirArquivo(uploadUrl, buf, { total, tamPedaco }) {
  const tamanho = buf.length;
  for (let i = 0; i < total; i++) {
    const ini = i * tamPedaco;
    const fim = i === total - 1 ? tamanho - 1 : ini + tamPedaco - 1;
    const up = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${ini}-${fim}/${tamanho}` },
      body: buf.subarray(ini, fim + 1),
    });
    if (!up.ok) throw new Error(`Falha ao enviar o vídeo para o TikTok (${up.status})`);
  }
}

/**
 * Manda o vídeo como RASCUNHO para dentro do TikTok da conta conectada.
 * O dono abre o TikTok, toca no aviso, cola a legenda e publica (o rascunho não leva legenda).
 */
export async function enviarRascunhoTiktok({ videoUrl }) {
  const buf = await baixarVideo(videoUrl);
  const p = pedacos(buf.length);
  const d = await chamar('/v2/post/publish/inbox/video/init/', {
    source_info: { source: 'FILE_UPLOAD', video_size: buf.length, chunk_size: p.tamPedaco, total_chunk_count: p.total },
  });
  await subirArquivo(d.upload_url, buf, p);
  return { id: d.publish_id };
}

/** Situação de um envio: { status, texto, erro } */
export async function statusEnvioTiktok(publishId) {
  const d = await chamar('/v2/post/publish/status/fetch/', { publish_id: publishId });
  const textos = {
    PROCESSING_UPLOAD: 'O TikTok está recebendo o vídeo...',
    PROCESSING_DOWNLOAD: 'O TikTok está recebendo o vídeo...',
    SEND_TO_USER_INBOX: 'Chegou! Abra o TikTok: o aviso do vídeo está na caixa de entrada.',
    PUBLISH_COMPLETE: 'Publicado no TikTok.',
    FAILED: `O TikTok recusou o vídeo${d.fail_reason ? ` (${d.fail_reason})` : ''}.`,
  };
  return { status: d.status || '', texto: textos[d.status] || d.status || '', erro: d.status === 'FAILED' ? d.fail_reason || 'falhou' : null };
}

/**
 * Postagem direta (fica PRIVADA enquanto o aplicativo não é auditado, e a conta precisa estar privada).
 * Mantida para as telas antigas do site; o dia a dia usa enviarRascunhoTiktok.
 */
export async function publicarNoTiktok({ videoUrl, legenda }) {
  const buf = await baixarVideo(videoUrl);
  const p = pedacos(buf.length);
  const d = await chamar('/v2/post/publish/video/init/', {
    post_info: {
      title: String(legenda || '').slice(0, 2200),
      privacy_level: 'SELF_ONLY',
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: { source: 'FILE_UPLOAD', video_size: buf.length, chunk_size: p.tamPedaco, total_chunk_count: p.total },
  });
  await subirArquivo(d.upload_url, buf, p);
  return { id: d.publish_id, url: null, obs: 'Entrou como privado — libere pelo app do TikTok' };
}
