// Conversa com a "Central" do Youvideo (na Vercel): biblioteca de vídeos, agenda das redes
// e envio de vídeos do PC para a nuvem (link público para Facebook/Instagram/TikTok).
const fs = require('fs');
const path = require('path');

const URL_PADRAO = 'https://youvideors2.vercel.app';

function base(cfg) {
  return String(cfg.centralUrl || URL_PADRAO).replace(/\/+$/, '');
}

async function chamar(cfg, rota, { metodo = 'GET', corpo, query } = {}) {
  if (!cfg.centralToken) throw new Error('Cadastre a senha da Central (CENTRAL_TOKEN) em Configurações.');
  const url = new URL(base(cfg) + rota);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: { 'x-central-token': cfg.centralToken, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    throw new Error(`Não consegui falar com o Youvideo (${base(cfg)}). Confira a internet.`);
  }
  const d = await r.json().catch(() => null);
  if (r.status === 404) throw new Error('A Central ainda não existe nesse endereço — o deploy novo do Youvideo já terminou na Vercel?');
  if (!r.ok) throw new Error(d?.erro || d?.error || `Youvideo respondeu ${r.status}`);
  return d;
}

/** Baixa um arquivo da internet para o PC, com progresso. */
async function baixar(url, destino, onProgresso) {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) return destino;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Não consegui baixar (${r.status}).`);
  const total = Number(r.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = destino + '.parcial';
  const arq = fs.createWriteStream(tmp);
  let feito = 0;
  for await (const pedaco of r.body) {
    if (!arq.write(pedaco)) await new Promise((ok) => arq.once('drain', ok));
    feito += pedaco.length;
    if (onProgresso && total) onProgresso(feito / total);
  }
  await new Promise((ok) => arq.end(ok));
  fs.renameSync(tmp, destino);
  return destino;
}

/** Sobe um vídeo do PC para o Vercel Blob e devolve o link público. */
async function subirParaNuvem(cfg, arquivo, onProgresso) {
  const { put } = require('@vercel/blob');
  const tamanho = fs.statSync(arquivo).size;
  const { token, pathname } = await chamar(cfg, '/api/central/upload-token', {
    metodo: 'POST',
    corpo: { nome: path.basename(arquivo), tamanho },
  });
  const r = await put(pathname, fs.createReadStream(arquivo), {
    access: 'public',
    token,
    multipart: true,
    contentType: 'video/mp4',
    addRandomSuffix: true,
    onUploadProgress: (e) => onProgresso && onProgresso((e.loaded || 0) / (e.total || tamanho)),
  });
  return r.url;
}

module.exports = { chamar, baixar, subirParaNuvem, URL_PADRAO };
