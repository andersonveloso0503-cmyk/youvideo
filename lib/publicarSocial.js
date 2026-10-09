// lib/publicarSocial.js
//
// Publica um vídeo ou imagem na Página "Em Nome de Jesus" (Facebook) e no
// Instagram (@emnomedejesus_rs) vinculado a ela.
//
// Variáveis de ambiente necessárias (Vercel):
//   FACEBOOK_PAGE_ACCESS_TOKEN  -> token de acesso da Página (de longa duração, ver nota no final)
//   FACEBOOK_PAGE_ID            -> 1298474906688229
//   INSTAGRAM_BUSINESS_ACCOUNT_ID -> pegue com GET /me?fields=instagram_business_account

const GRAPH_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Contas: padrão = Página "Em Nome de Jesus"; 'lcs' = Página e Instagram da LCS Terceirização
const CONTAS = {
  // LCS: basta a chave (LCS_FACEBOOK_PAGE_ACCESS_TOKEN). A Página já é conhecida e o Instagram é descoberto sozinho.
  lcs: { token: 'LCS_FACEBOOK_PAGE_ACCESS_TOKEN', pagina: 'LCS_FACEBOOK_PAGE_ID', instagram: 'LCS_INSTAGRAM_BUSINESS_ACCOUNT_ID', paginaPadrao: '312936395792797' },
};
const PADRAO = { token: 'FACEBOOK_PAGE_ACCESS_TOKEN', pagina: 'FACEBOOK_PAGE_ID', instagram: 'INSTAGRAM_BUSINESS_ACCOUNT_ID' };
const descobertos = {}; // por conta: { token da página, id do Instagram } (vale enquanto a função está no ar)

function variavel(conta, qual) {
  const c = CONTAS[conta] || PADRAO;
  if (descobertos[conta]?.[qual]) return descobertos[conta][qual];
  const valor = process.env[c[qual]] || (qual === 'pagina' ? c.paginaPadrao : '');
  if (!valor) throw new Error(`${c[qual]} não configurada na Vercel`);
  return valor;
}
function tokenPagina(conta) {
  return variavel(conta, 'token');
}

/**
 * Contas extras (ex.: LCS): aceita tanto a chave da Página quanto a chave do usuário do sistema.
 * Troca pela chave da Página e descobre o Instagram ligado a ela, uma vez só.
 */
async function prepararConta(conta) {
  if (!CONTAS[conta] || descobertos[conta]?.pronto) return;
  const c = CONTAS[conta];
  const base = process.env[c.token];
  if (!base) throw new Error(`${c.token} não configurada na Vercel`);
  const pagina = process.env[c.pagina] || c.paginaPadrao;
  const achado = { pronto: true };
  try {
    const r = await fetch(`${GRAPH_URL}/${pagina}?fields=access_token,instagram_business_account&access_token=${encodeURIComponent(base)}`);
    const d = await r.json();
    if (d.access_token) achado.token = d.access_token;
    if (d.instagram_business_account?.id && !process.env[c.instagram]) achado.instagram = d.instagram_business_account.id;
    if (d.error) achado.erro = d.error.message;
  } catch { /* usa a chave como veio */ }
  descobertos[conta] = achado;
}

// --- Facebook ---

// Reels: vídeo em pé, até 90 s. O Facebook mostra Reels para quem NÃO segue a Página;
// vídeo comum (/videos) só aparece para quem já segue — por isso quase ninguém via.
async function publicarReelFacebook({ videoUrl, legenda, conta }) {
  await prepararConta(conta);
  const pageId = variavel(conta, 'pagina');
  const token = tokenPagina(conta);
  const ini = await (await fetch(`${GRAPH_URL}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: token }),
  })).json();
  if (!ini.video_id) throw new Error(`Reels (início): ${JSON.stringify(ini.error || ini)}`);
  const up = await (await fetch(`https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${ini.video_id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
  })).json();
  if (!up.success) throw new Error(`Reels (envio): ${JSON.stringify(up.error || up)}`);
  const fim = await (await fetch(`${GRAPH_URL}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'finish', video_id: ini.video_id, video_state: 'PUBLISHED', description: legenda, access_token: token }),
  })).json();
  if (!fim.success) throw new Error(`Reels (publicar): ${JSON.stringify(fim.error || fim)}`);
  return { id: ini.video_id, url: `https://www.facebook.com/reel/${ini.video_id}`, reel: true };
}

async function publicarVideoFacebook({ videoUrl, legenda, conta, curto }) {
  if (curto) {
    try {
      return await publicarReelFacebook({ videoUrl, legenda, conta });
    } catch (e) {
      console.warn('Reels falhou, vai como vídeo comum:', e.message);
    }
  }
  await prepararConta(conta);
  const pageId = variavel(conta, 'pagina');

  const resp = await fetch(`${GRAPH_URL}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url: videoUrl,
      description: legenda,
      access_token: tokenPagina(conta),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Facebook (vídeo) respondeu ${resp.status}: ${JSON.stringify(data)}`);
  return { id: data.id, url: `https://www.facebook.com/${data.id}` };
}

async function publicarImagemFacebook({ imagemUrl, legenda }) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!pageId) throw new Error('FACEBOOK_PAGE_ID não configurada');

  const resp = await fetch(`${GRAPH_URL}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imagemUrl,
      caption: legenda,
      access_token: tokenPagina(),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Facebook (imagem) respondeu ${resp.status}: ${JSON.stringify(data)}`);
  return { id: data.post_id || data.id, url: `https://www.facebook.com/${data.post_id || data.id}` };
}

// --- Instagram ---
// Publicar no Instagram é em 2 passos: criar o "container" de mídia,
// esperar ele processar, e só depois publicar de fato.

async function criarContainerInstagram({ tipo, midiaUrl, legenda, conta }) {
  await prepararConta(conta);
  if (CONTAS[conta] && !descobertos[conta]?.instagram && !process.env[CONTAS[conta].instagram]) {
    throw new Error(`Não achei um Instagram profissional ligado à Página dessa conta${descobertos[conta]?.erro ? ` (${descobertos[conta].erro})` : ''}. Ligue o Instagram à Página no Meta Business Suite ou crie ${CONTAS[conta].instagram} na Vercel.`);
  }
  const igId = variavel(conta, 'instagram');

  const corpo = {
    caption: legenda,
    access_token: tokenPagina(conta),
  };
  if (tipo === 'video') {
    corpo.media_type = 'REELS';
    corpo.video_url = midiaUrl;
  } else {
    corpo.image_url = midiaUrl;
  }

  const resp = await fetch(`${GRAPH_URL}/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Instagram (criar container) respondeu ${resp.status}: ${JSON.stringify(data)}`);
  return data.id; // creation_id
}

async function esperarContainerPronto(creationId, { tentativas = 30, intervaloMs = 3000 } = {}) {
  for (let i = 0; i < tentativas; i++) {
    const resp = await fetch(
      `${GRAPH_URL}/${creationId}?fields=status_code&access_token=${tokenPagina()}`
    );
    const data = await resp.json();
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') throw new Error('Instagram falhou ao processar a mídia.');
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  throw new Error('Instagram demorou demais pra processar a mídia (timeout).');
}

async function publicarContainerInstagram(creationId, conta) {
  await prepararConta(conta);
  const igId = variavel(conta, 'instagram');
  const resp = await fetch(`${GRAPH_URL}/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: tokenPagina(conta) }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Instagram (publicar) respondeu ${resp.status}: ${JSON.stringify(data)}`);
  return { id: data.id };
}

async function publicarNoInstagram({ tipo, midiaUrl, legenda }) {
  const creationId = await criarContainerInstagram({ tipo, midiaUrl, legenda });
  // vídeo precisa esperar processar; imagem geralmente já sai pronta, mas
  // não custa checar do mesmo jeito
  await esperarContainerPronto(creationId);
  const resultado = await publicarContainerInstagram(creationId);
  return { id: resultado.id, url: `https://www.instagram.com/p/${resultado.id}` };
}

/** Status do container do Instagram: FINISHED | IN_PROGRESS | ERROR | EXPIRED ... */
async function statusContainerInstagram(creationId, conta) {
  await prepararConta(conta);
  const resp = await fetch(`${GRAPH_URL}/${creationId}?fields=status_code,status&access_token=${tokenPagina(conta)}`);
  const data = await resp.json();
  return { codigo: data.status_code || 'IN_PROGRESS', detalhe: data.status || '' };
}

/** Confere se a conta (ex.: 'lcs') está ligada: nome da Página, Instagram e o que falta. Não publica nada. */
async function testarConta(conta) {
  const c = CONTAS[conta];
  if (!c) return { ok: false, erros: ['Conta desconhecida.'] };
  const base = process.env[c.token];
  if (!base) return { ok: false, falta: c.token, erros: [`Ainda não existe a variável ${c.token} na Vercel (ou falta o Redeploy depois de criar).`] };
  const pagina = process.env[c.pagina] || c.paginaPadrao;
  const r = { ok: false, pagina: null, instagram: null, erros: [] };
  try {
    const resp = await fetch(`${GRAPH_URL}/${pagina}?fields=name,access_token,instagram_business_account{username}&access_token=${encodeURIComponent(base)}`);
    const d = await resp.json();
    if (d.error) {
      r.erros.push(`A Meta recusou a chave: ${d.error.message}`);
      return r;
    }
    r.pagina = { id: pagina, nome: d.name || '' };
    if (!d.access_token) r.erros.push('A chave não tem permissão para publicar nessa Página (faltam pages_manage_posts / pages_read_engagement, ou o usuário do sistema não tem acesso à Página).');
    if (d.instagram_business_account?.id) r.instagram = { id: d.instagram_business_account.id, usuario: d.instagram_business_account.username || '' };
    else r.erros.push('Não achei um Instagram profissional ligado a essa Página (ou falta a permissão instagram_basic). O Facebook funciona; o Instagram não.');
    // Permissões da chave (só chave de usuário/sistema responde; chave de Página dá erro e tudo bem)
    try {
      const p = await (await fetch(`${GRAPH_URL}/me/permissions?access_token=${encodeURIComponent(base)}`)).json();
      const dadas = (p.data || []).filter((x) => x.status === 'granted').map((x) => x.permission);
      if (dadas.length) {
        r.permissoes = dadas;
        for (const precisa of ['pages_manage_posts', 'instagram_content_publish']) {
          if (!dadas.includes(precisa)) r.erros.push(`Falta a permissão ${precisa} na chave.`);
        }
      }
    } catch { /* chave de Página */ }
    r.ok = !!d.access_token;
    r.instagramOk = !!r.instagram && !r.erros.some((e) => /instagram_content_publish/.test(e));
  } catch (e) {
    r.erros.push(`Não consegui falar com a Meta: ${e.message}`);
  }
  return r;
}

module.exports = {
  testarConta,
  publicarVideoFacebook,
  publicarImagemFacebook,
  publicarNoInstagram,
  criarContainerInstagram,
  statusContainerInstagram,
  publicarContainerInstagram,
};
