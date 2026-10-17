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
// Baixa com paciência: site pedindo calma (429, comum no Wikimedia das fotos do documentário),
// servidor fora do ar (5xx) ou internet que caiu no meio ("fetch failed", "terminated") → espera e tenta de novo
async function baixar(url, destino, onProgresso) {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) return destino;
  let ultimo;
  for (let vez = 0; vez < 6; vez++) {
    try {
      return await baixarUmaVez(url, destino, onProgresso);
    } catch (e) {
      ultimo = e;
      const status = e.status || 0;
      if (status && status !== 429 && status !== 408 && status < 500) throw e; // 404, 403...: não adianta insistir
      const espera = e.retryAfter ? Math.min(120, e.retryAfter) * 1000 : Math.min(60000, 3000 * 2 ** vez);
      await new Promise((ok) => setTimeout(ok, espera));
    }
  }
  throw ultimo;
}

async function baixarUmaVez(url, destino, onProgresso) {
  // O Wikimedia barra quem baixa sem se identificar (User-Agent)
  const r = await fetch(url, { headers: { 'User-Agent': 'YouvideoCompilador/2 (https://youvideors2.vercel.app; lcs@lcsterceirizacao.com.br)' } });
  if (!r.ok || !r.body) {
    const e = new Error(`Não consegui baixar (${r.status}).`);
    e.status = r.status;
    e.retryAfter = Number(r.headers.get('retry-after')) || 0;
    throw e;
  }
  const total = Number(r.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = destino + '.parcial';
  const arq = fs.createWriteStream(tmp);
  let feito = 0;
  try {
    for await (const pedaco of r.body) {
      if (!arq.write(pedaco)) await new Promise((ok) => arq.once('drain', ok));
      feito += pedaco.length;
      if (onProgresso && total) onProgresso(feito / total);
    }
    await new Promise((ok) => arq.end(ok));
  } catch (e) {
    // Caiu no meio: fecha o arquivo pela metade (no Windows, arquivo aberto não deixa tentar de novo)
    await new Promise((ok) => arq.destroy() && arq.once('close', ok) || setTimeout(ok, 200));
    throw e;
  }
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
    contentType: /\.jpe?g$/i.test(arquivo) ? 'image/jpeg' : /\.png$/i.test(arquivo) ? 'image/png' : 'video/mp4',
    addRandomSuffix: true,
    onUploadProgress: (e) => onProgresso && onProgresso((e.loaded || 0) / (e.total || tamanho)),
  });
  return r.url;
}

module.exports = { chamar, baixar, subirParaNuvem, URL_PADRAO };
