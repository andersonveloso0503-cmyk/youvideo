// Tela final do YouTube: nos últimos 20 s de vídeos longos escurece a imagem e desenha um layout
// ("Obrigado por assistir", espaço para o vídeo sugerido e para o botão de inscrição).
// O YouTube não deixa programas colocarem os elementos da tela final, mas com esse fundo
// é só usar "Importar do vídeo" no Studio e os elementos encaixam em cima.
//
// Para não recodificar um vídeo de 1-3 horas inteiro, só os últimos ~20-40 s são refeitos:
// o começo é copiado como está (até o último quadro-chave) e as duas partes são juntadas.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { FFPROBE, probe, rodar } = require('./ffmpeg');

const SEG = 20; // duração da tela final (o YouTube permite de 5 a 20 s)

function ffprobeTexto(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, ['-v', 'error', ...args], { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve(out) : reject(new Error('ffprobe falhou'))));
  });
}

async function detalhes(arquivo, total) {
  const j = JSON.parse(await ffprobeTexto(['-print_format', 'json', '-show_streams', arquivo]));
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  const a = (j.streams || []).find((s) => s.codec_type === 'audio') || null;
  // Último quadro-chave antes do começo da tela final
  const inicio = Math.max(0, total - SEG - 30);
  const txt = await ffprobeTexto([
    '-select_streams', 'v:0', '-skip_frame', 'nokey', '-read_intervals', `${inicio.toFixed(2)}%`,
    '-show_entries', 'frame=pts_time,best_effort_timestamp_time', '-of', 'csv=p=0', arquivo,
  ]);
  const chaves = txt.split('\n').map((l) => parseFloat(l.split(',')[0])).filter((x) => isFinite(x) && x <= total - SEG);
  return {
    fps: v.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate || '30',
    codecVideo: v.codec_name,
    codecAudio: a?.codec_name || null,
    taxaAudio: a?.sample_rate || '48000',
    canais: a?.channels || 2,
    temAudio: !!a,
    corte: chaves.length ? Math.max(...chaves) : null,
  };
}

function assTelaFinal(W, H, ini, fim) {
  const t = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(2).padStart(5, '0');
    return `${h}:${String(m).padStart(2, '0')}:${x}`;
  };
  const a = t(ini), b = t(fim);
  // Áreas (proporcionais): vídeo sugerido à direita, inscrição à esquerda
  const vx1 = Math.round(W * 0.53), vy1 = Math.round(H * 0.32), vx2 = Math.round(W * 0.93), vy2 = Math.round(vy1 + (W * 0.40 * 9) / 16);
  const cx = Math.round(W * 0.24), cy = Math.round(H * 0.50), r = Math.round(H * 0.13);
  const linha = Math.max(3, Math.round(H / 270));
  const retangulo = `m ${vx1} ${vy1} l ${vx2} ${vy1} ${vx2} ${vy2} ${vx1} ${vy2}`;
  // Círculo em desenho ASS (4 curvas de Bézier)
  const k = Math.round(r * 0.5523);
  const circulo = `m ${cx} ${cy - r} b ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} b ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} b ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} b ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r}`;
  const f = (x) => Math.round(H * x);
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Titulo,Montserrat ExtraBold,${f(0.085)},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${f(0.006)},${f(0.004)},8,10,10,${f(0.09)},1`,
    `Style: Rotulo,Montserrat ExtraBold,${f(0.05)},&H0000D7FF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${f(0.004)},${f(0.003)},5,10,10,10,1`,
    `Style: Desenho,Montserrat ExtraBold,20,&HFFFFFFFF,&H000000FF,&H00FFFFFF,&HFF000000,0,0,0,0,100,100,0,0,1,${linha},0,7,0,0,0,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 1,${a},${b},Titulo,,0,0,0,,{\\fad(600,0)}OBRIGADO POR ASSISTIR!`,
    `Dialogue: 1,${a},${b},Rotulo,,0,0,0,,{\\fad(600,0)\\pos(${Math.round((vx1 + vx2) / 2)},${vy1 - f(0.06)})}ASSISTA O PRÓXIMO`,
    `Dialogue: 1,${a},${b},Rotulo,,0,0,0,,{\\fad(600,0)\\pos(${cx},${cy + r + f(0.07)})}INSCREVA-SE`,
    `Dialogue: 0,${a},${b},Desenho,,0,0,0,,{\\fad(600,0)\\pos(0,0)\\p1}${retangulo}{\\p0}`,
    `Dialogue: 0,${a},${b},Desenho,,0,0,0,,{\\fad(600,0)\\pos(0,0)\\p1}${circulo}{\\p0}`,
  ].join('\n');
}

/**
 * Coloca a tela final nos últimos 20 s. Devolve o novo arquivo, ou o original se o vídeo for curto
 * ou se algo falhar (nunca impede o envio).
 */
async function aplicarTelaFinal(arquivo, { fontsDir, onProgresso, onCancelar } = {}) {
  const info = await probe(arquivo);
  const total = info.duracao || 0;
  const W = info.largura, H = info.altura;
  if (!W || !H || total < 60 || H > W) return arquivo; // só vídeo longo e deitado
  const d = await detalhes(arquivo, total);
  if (d.corte == null || d.codecVideo !== 'h264' || (d.temAudio && d.codecAudio !== 'aac')) return arquivo;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youvideo-telafinal-'));
  const saida = arquivo.replace(/\.mp4$/i, '') + '-telafinal.mp4';
  try {
    const ini = Math.max(0, total - SEG - d.corte);
    fs.writeFileSync(path.join(dir, 'tf.ass'), assTelaFinal(W, H, ini, total - d.corte + 1));
    fs.mkdirSync(path.join(dir, 'fonts'));
    for (const f of fs.readdirSync(fontsDir)) fs.copyFileSync(path.join(fontsDir, f), path.join(dir, 'fonts', f));

    const passo = async (args, dur, de, ate) => {
      const r = rodar(args, { cwd: dir, duracaoTotal: dur, onProgresso: (x) => onProgresso?.(de + x * (ate - de)) });
      onCancelar?.(r.cancelar);
      await r.promise;
    };
    // 1) começo copiado como está (até o quadro-chave)
    await passo(['-i', arquivo, '-t', d.corte.toFixed(3), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts', 'a.ts'], d.corte, 0, 0.5);
    // 2) final refeito com a tela final por cima
    const resto = total - d.corte;
    const filtro = `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,${ini.toFixed(3)})',ass=tf.ass:fontsdir=fonts,format=yuv420p`;
    await passo([
      '-ss', d.corte.toFixed(3), '-i', arquivo, '-map', '0:v:0', '-map', '0:a:0?', '-vf', filtro, '-r', d.fps,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
      ...(d.temAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', String(d.taxaAudio), '-ac', String(d.canais)] : []),
      '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts', 'b.ts',
    ], resto, 0.5, 0.9);
    // 3) junta as duas partes
    fs.writeFileSync(path.join(dir, 'lista.txt'), "file 'a.ts'\nfile 'b.ts'\n");
    await passo(['-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-map', '0:v', '-map', '0:a?', '-c', 'copy', ...(d.temAudio ? ['-bsf:a', 'aac_adtstoasc'] : []), '-movflags', '+faststart', saida], total, 0.9, 1);
    const fim = await probe(saida);
    if (Math.abs(fim.duracao - total) > 3) throw new Error('duração diferente');
    return saida;
  } catch (e) {
    if (e.message === 'CANCELADO') throw e;
    try { fs.unlinkSync(saida); } catch {}
    return arquivo;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { aplicarTelaFinal, assTelaFinal };
