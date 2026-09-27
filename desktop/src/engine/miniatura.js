// Capa (miniatura) no padrão do YouTube: 1280x720 (16:9), JPG, menos de 2 MB.
const fs = require('fs');
const path = require('path');
const { rodar, probe } = require('./ffmpeg');
const { ehImagem } = require('./render');

const LIMITE = 2 * 1024 * 1024 - 50 * 1024; // um pouco abaixo de 2 MB

/** Cria a capa a partir de uma imagem, ou de um quadro do vídeo. */
async function gerarMiniatura(origem, destino, { vertical = false } = {}) {
  const [w, h] = vertical ? [720, 1280] : [1280, 720];
  const filtro = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  let entrada = ['-i', origem];
  if (!ehImagem(origem)) {
    // Vídeo: pega um quadro a 10% (no máximo aos 60 s) para não cair num começo preto
    const info = await probe(origem).catch(() => ({ duracao: 0 }));
    const seg = Math.min(60, Math.max(1, (info.duracao || 10) * 0.1));
    entrada = ['-ss', seg.toFixed(2), '-i', origem];
  }
  for (const q of [2, 4, 6, 9, 13]) {
    await rodar([...entrada, '-vf', filtro, '-frames:v', '1', '-q:v', String(q), destino]).promise;
    if (fs.statSync(destino).size <= LIMITE) return destino;
  }
  return destino;
}

/** Procura uma imagem com o mesmo nome do vídeo na mesma pasta (ex.: "rock - Parte 1.jpg"). */
function capaAoLado(video) {
  const base = video.slice(0, -path.extname(video).length);
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.bmp']) {
    for (const c of [base + ext, base + ext.toUpperCase()]) if (fs.existsSync(c)) return c;
  }
  return null;
}

module.exports = { gerarMiniatura, capaAoLado };
