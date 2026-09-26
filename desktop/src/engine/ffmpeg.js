// Localiza o ffmpeg/ffprobe que vêm junto com o app e roda comandos com progresso.
const { spawn } = require('child_process');
const os = require('os');

function corrigirCaminhoAsar(p) {
  // Dentro do instalador os binários ficam em app.asar.unpacked (não dá pra executar de dentro do .asar)
  return p ? p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep) : p;
}

const FFMPEG = corrigirCaminhoAsar(require('ffmpeg-static'));
const FFPROBE = corrigirCaminhoAsar(require('ffprobe-static').path);

function probe(arquivo) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', arquivo]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Não consegui ler o arquivo: ${arquivo}\n${err.slice(-300)}`));
      try {
        const j = JSON.parse(out);
        const video = (j.streams || []).find((s) => s.codec_type === 'video');
        const audio = (j.streams || []).find((s) => s.codec_type === 'audio');
        resolve({
          duracao: parseFloat(j.format?.duration || video?.duration || audio?.duration || 0) || 0,
          largura: video?.width || 0,
          altura: video?.height || 0,
          temVideo: !!video,
          temAudio: !!audio,
          titulo: j.format?.tags?.title || j.format?.tags?.TITLE || null,
          artista: j.format?.tags?.artist || j.format?.tags?.ARTIST || null,
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Prioridade de processo por modo de desempenho — "leve" deixa o PC livre pra usar enquanto gera
const PRIORIDADE = {
  leve: os.constants.priority.PRIORITY_LOW,
  normal: os.constants.priority.PRIORITY_BELOW_NORMAL,
  maximo: os.constants.priority.PRIORITY_NORMAL,
};

/**
 * Roda o ffmpeg. `duracaoTotal` (segundos) permite calcular % de progresso.
 * Retorna { promise, cancelar }.
 */
function rodar(args, { duracaoTotal = 0, onProgresso, modo = 'normal', cwd } = {}) {
  const finalArgs = ['-hide_banner', '-y', '-nostdin', '-progress', 'pipe:1', '-nostats', ...args];
  const p = spawn(FFMPEG, finalArgs, { cwd, windowsHide: true });
  try {
    os.setPriority(p.pid, PRIORIDADE[modo] ?? PRIORIDADE.normal);
  } catch {}
  let cancelado = false;
  let stderr = '';
  let buf = '';
  const promise = new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => {
      buf += d.toString();
      const linhas = buf.split('\n');
      buf = linhas.pop();
      for (const l of linhas) {
        const [k, v] = l.split('=');
        if ((k === 'out_time_us' || k === 'out_time_ms') && onProgresso && duracaoTotal > 0) {
          const seg = parseInt(v, 10) / 1e6;
          if (!isNaN(seg)) onProgresso(Math.max(0, Math.min(1, seg / duracaoTotal)), seg);
        }
      }
    });
    p.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-10000);
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (cancelado) return reject(new Error('CANCELADO'));
      if (code !== 0) return reject(new Error('Erro no ffmpeg:\n' + stderr.split('\n').slice(-12).join('\n')));
      resolve();
    });
  });
  return {
    promise,
    cancelar: () => {
      cancelado = true;
      try {
        p.kill('SIGKILL');
      } catch {}
    },
  };
}

// Testa quais codificadores de vídeo por hardware funcionam neste PC
let encoderCache = null;
async function detectarEncoder() {
  if (encoderCache) return encoderCache;
  const candidatos = ['h264_nvenc', 'h264_qsv', 'h264_amf'];
  for (const enc of candidatos) {
    try {
      const r = rodar(['-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.3', '-c:v', enc, '-f', 'null', '-']);
      await Promise.race([r.promise, new Promise((_, rej) => setTimeout(() => (r.cancelar(), rej(new Error('timeout'))), 8000))]);
      encoderCache = enc;
      return enc;
    } catch {}
  }
  encoderCache = 'libx264';
  return encoderCache;
}

module.exports = { FFMPEG, FFPROBE, probe, rodar, detectarEncoder };
