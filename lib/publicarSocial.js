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
  lcs: { token: 'LCS_FACEBOOK_PAGE_ACCESS_TOKEN', pagina: 'LCS_FACEBOOK_PAGE_ID', instagram: 'LCS_INSTAGRAM_BUSINESS_ACCOUNT_ID' },
};
function variavel(conta, qual) {
  const nome = (CONTAS[conta] || { token: 'FACEBOOK_PAGE_ACCESS_TOKEN', pagina: 'FACEBOOK_PAGE_ID', instagram: 'INSTAGRAM_BUSINESS_ACCOUNT_ID' })[qual];
  const valor = process.env[nome];
  if (!valor) throw new Error(`${nome} não configurada na Vercel`);
  return valor;
}
function tokenPagina(conta) {
  return variavel(conta, 'token');
}

// --- Facebook ---

async function publicarVideoFacebook({ videoUrl, legenda, conta }) {
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
  const resp = await fetch(`${GRAPH_URL}/${creationId}?fields=status_code,status&access_token=${tokenPagina(conta)}`);
  const data = await resp.json();
  return { codigo: data.status_code || 'IN_PROGRESS', detalhe: data.status || '' };
}

module.exports = {
  publicarVideoFacebook,
  publicarImagemFacebook,
  publicarNoInstagram,
  criarContainerInstagram,
  statusContainerInstagram,
  publicarContainerInstagram,
};
