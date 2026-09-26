// Separação de voz e instrumental usando a mesma fal.ai (Demucs) do /cover do Youvideo.
// O resultado fica guardado em cache no PC — a mesma música nunca é separada (nem cobrada) duas vezes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fal } = require('@fal-ai/client');
const { rodar } = require('./ffmpeg');

function chaveCache(arquivo) {
  const st = fs.statSync(arquivo);
  return crypto.createHash('sha1').update(`${path.resolve(arquivo)}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 20);
}

async function baixar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao baixar ${url} (${r.status})`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
  return destino;
}

/**
 * Devolve { instrumental, voz } (caminhos locais) para a música.
 */
async function separar(arquivo, { falKey, dirCache, onStatus, registrarCancelar }) {
  if (!falKey) throw new Error('Para separar voz/instrumental, cadastre a chave da fal.ai em Configurações.');
  const pasta = path.join(dirCache, 'separacao', chaveCache(arquivo));
  const instrumental = path.join(pasta, 'instrumental.m4a');
  const voz = path.join(pasta, 'voz.mp3');
  if (fs.existsSync(instrumental) && fs.existsSync(voz)) return { instrumental, voz, cache: true };
  fs.mkdirSync(pasta, { recursive: true });

  // Envia uma versão mp3 menor (upload mais rápido)
  onStatus && onStatus('Preparando envio');
  const envio = path.join(pasta, 'envio.mp3');
  const r = rodar(['-i', arquivo, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', envio]);
  registrarCancelar && registrarCancelar(r.cancelar);
  await r.promise;

  fal.config({ credentials: falKey });
  onStatus && onStatus('Enviando para a fal.ai');
  const url = await fal.storage.upload(new Blob([fs.readFileSync(envio)], { type: 'audio/mpeg' }));

  onStatus && onStatus('Separando voz (fal.ai)');
  const resultado = await fal.subscribe('fal-ai/demucs', {
    input: { audio_url: url, output_format: 'mp3' },
    onQueueUpdate: (u) => {
      if (u.status === 'IN_QUEUE') onStatus && onStatus(`Na fila da fal.ai${u.queue_position != null ? ` (posição ${u.queue_position})` : ''}`);
      if (u.status === 'IN_PROGRESS') onStatus && onStatus('Separando voz (fal.ai)');
    },
  });
  const dados = resultado.data || resultado;
  const vozUrl = dados?.vocals?.url;
  const partes = Object.entries(dados || {})
    .filter(([k, v]) => k !== 'vocals' && v && typeof v.url === 'string')
    .map(([, v]) => v.url);
  if (!vozUrl || !partes.length) throw new Error('A fal.ai não devolveu as faixas separadas.');

  onStatus && onStatus('Baixando faixas separadas');
  await baixar(vozUrl, voz);
  const locais = [];
  for (let i = 0; i < partes.length; i++) locais.push(await baixar(partes[i], path.join(pasta, `inst_${i}.mp3`)));

  // Junta bateria + baixo + outros num instrumental só
  const args = [];
  locais.forEach((l) => args.push('-i', l));
  const mix = locais.length === 1
    ? '[0:a]anull[m]'
    : locais.map((_, i) => `[${i}:a]`).join('') + `amix=inputs=${locais.length}:normalize=0:duration=longest[m]`;
  const r2 = rodar([...args, '-filter_complex', mix, '-map', '[m]', '-c:a', 'aac', '-b:a', '256k', instrumental]);
  registrarCancelar && registrarCancelar(r2.cancelar);
  await r2.promise;
  locais.forEach((l) => fs.rmSync(l, { force: true }));
  fs.rmSync(envio, { force: true });
  return { instrumental, voz, cache: false };
}

module.exports = { separar, chaveCache };
