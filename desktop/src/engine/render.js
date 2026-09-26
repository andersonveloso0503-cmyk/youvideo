// Motor de montagem local: junta as músicas, prepara os fundos, desenha a onda
// de áudio e gera o vídeo final com ffmpeg — tudo no PC, sem custo por vídeo.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { probe, rodar } = require('./ffmpeg');

const FPS = 24;
// Imagens que o ffmpeg abre direto (JFIF do Gemini/WhatsApp é JPEG com outro nome)
const EXT_IMAGEM = ['.jpg', '.jpeg', '.jfif', '.jpe', '.pjpeg', '.pjp', '.png', '.webp', '.bmp', '.tif', '.tiff', '.avif', '.ico', '.tga', '.ppm', '.jxl'];

const RESOLUCOES = {
  '720': [1280, 720],
  '1080': [1920, 1080],
  '1440': [2560, 1440],
  '2160': [3840, 2160],
};

function dimensoes(formato) {
  const [w, h] = RESOLUCOES[formato?.resolucao || '1080'] || RESOLUCOES['1080'];
  return formato?.tipo === 'curto' ? [h, w] : [w, h]; // Shorts = vertical
}

function ehImagem(p) {
  return EXT_IMAGEM.includes(path.extname(p).toLowerCase());
}

function hexParaFfmpeg(hex) {
  const h = String(hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6);
  return '0x' + h.toUpperCase();
}

function par(n) {
  n = Math.round(n);
  return n % 2 === 0 ? n : n + 1;
}

function threadsPorModo(modo) {
  const nucleos = os.cpus().length || 2;
  if (modo === 'leve') return Math.max(1, Math.floor(nucleos / 2));
  if (modo === 'normal') return Math.max(1, nucleos - 1);
  return 0; // automático = todos
}

function argsEncoder(encoder, modo) {
  const threads = String(threadsPorModo(modo));
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '23', '-pix_fmt', 'nv12'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '24', '-pix_fmt', 'yuv420p'];
    default:
      return [
        '-c:v', 'libx264',
        '-preset', modo === 'maximo' ? 'veryfast' : 'superfast',
        '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', threads,
      ];
  }
}

/**
 * Divide as músicas em vários vídeos quando existe duração máxima.
 * Ex.: 10 músicas de 20 min com máximo de 60 min => 4 vídeos.
 */
function dividirEmVideos(musicas, { duracaoMaxMin, limiteMusicaSeg, crossfade = 0 }) {
  const max = duracaoMaxMin ? duracaoMaxMin * 60 : Infinity;
  const grupos = [];
  let atual = [];
  let total = 0;
  for (const m of musicas) {
    const d = limiteMusicaSeg ? Math.min(m.duracao, limiteMusicaSeg) : m.duracao;
    const extra = atual.length ? d - crossfade : d;
    if (atual.length && total + extra > max) {
      grupos.push(atual);
      atual = [];
      total = 0;
    }
    atual.push(m);
    total += atual.length === 1 ? d : d - crossfade;
  }
  if (atual.length) grupos.push(atual);
  return grupos;
}

function formatarTempo(seg) {
  seg = Math.max(0, Math.floor(seg));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return (h ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
}

/** Monta uma trilha só com todas as músicas (com transição e normalização opcionais). */
async function prepararAudio({ musicas, audio, formato, dir, modo, onProgresso, registrarCancelar }) {
  const limite = Number(formato?.limiteMusicaSeg) || 0;
  const cf = Math.max(0, Math.min(10, Number(audio?.crossfade) || 0));
  const normalizar = !!audio?.normalizar;

  // Duração real de cada faixa depois do corte
  const faixas = musicas.map((m) => ({ ...m, dur: limite ? Math.min(m.duracao, limite) : m.duracao }));
  const timeline = [];
  let t = 0;
  faixas.forEach((f, i) => {
    const inicio = i === 0 ? 0 : t - cf;
    timeline.push({ titulo: f.titulo, inicio, fim: inicio + f.dur, arquivoOriginal: f.arquivoOriginal || f.arquivo });
    t = inicio + f.dur;
  });
  let total = t;

  const maxMin = Number(formato?.duracaoMaxMin) || (formato?.tipo === 'curto' ? 1 : 0);
  const maxTotal = maxMin ? maxMin * 60 : Infinity;
  if (total > maxTotal) total = maxTotal;

  // Processa em lotes pra não estourar o limite de linha de comando do Windows
  const LOTE = 30;
  const lotes = [];
  for (let i = 0; i < faixas.length; i += LOTE) lotes.push(faixas.slice(i, i + LOTE));

  const saidasLote = [];
  let feito = 0;
  const duracaoFaixas = faixas.reduce((a, f) => a + f.dur, 0) || 1;

  for (let li = 0; li < lotes.length; li++) {
    const lote = lotes[li];
    const args = [];
    lote.forEach((f) => args.push('-i', f.arquivo));
    const partes = [];
    lote.forEach((f, i) => {
      const fadeOut = Math.max(0, f.dur - 1.5);
      let cadeia = `[${i}:a]atrim=0:${f.dur.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`;
      if (normalizar) cadeia += ',loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000';
      if (cf === 0 && limite && f.duracao > limite) cadeia += `,afade=t=out:st=${fadeOut.toFixed(3)}:d=1.5`;
      partes.push(`${cadeia}[a${i}]`);
    });
    let ultimo = 'a0';
    if (lote.length > 1) {
      if (cf > 0) {
        for (let i = 1; i < lote.length; i++) {
          const nome = i === lote.length - 1 ? 'saida' : `x${i}`;
          partes.push(`[${ultimo}][a${i}]acrossfade=d=${cf}:c1=tri:c2=tri[${nome}]`);
          ultimo = nome;
        }
      } else {
        partes.push(lote.map((_, i) => `[a${i}]`).join('') + `concat=n=${lote.length}:v=0:a=1[saida]`);
        ultimo = 'saida';
      }
    }
    const saida = path.join(dir, `audio_lote_${li}.m4a`);
    const durLote = lote.reduce((a, f) => a + f.dur, 0);
    const r = rodar(
      [...args, '-filter_complex', partes.join(';'), '-map', `[${ultimo}]`, '-c:a', 'aac', '-b:a', lotes.length > 1 ? '320k' : '192k', '-vn', saida],
      {
        duracaoTotal: durLote,
        modo,
        onProgresso: (p) => onProgresso && onProgresso((feito + p * durLote) / duracaoFaixas),
      }
    );
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
    feito += durLote;
    saidasLote.push(saida);
  }

  const final = path.join(dir, 'audio.m4a');
  if (saidasLote.length === 1) {
    fs.renameSync(saidasLote[0], final);
  } else {
    const args = [];
    saidasLote.forEach((s) => args.push('-i', s));
    const partes = [];
    let ultimo = '0:a';
    if (cf > 0) {
      for (let i = 1; i < saidasLote.length; i++) {
        const nome = `j${i}`;
        partes.push(`[${ultimo}][${i}:a]acrossfade=d=${cf}:c1=tri:c2=tri[${nome}]`);
        ultimo = nome;
      }
    } else {
      partes.push(saidasLote.map((_, i) => `[${i}:a]`).join('') + `concat=n=${saidasLote.length}:v=0:a=1[j]`);
      ultimo = 'j';
    }
    const r = rodar([...args, '-filter_complex', partes.join(';'), '-map', `[${ultimo}]`, '-c:a', 'aac', '-b:a', '192k', final], { modo });
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
  }

  return { arquivo: final, timeline: timeline.filter((x) => x.inicio < total), total };
}

/** Filtro que encaixa a imagem/vídeo no tamanho do vídeo (cortando ou com fundo desfocado). */
function filtroEnquadrar(W, H, enquadramento, extras = '') {
  const pos = extras ? `,${extras}` : '';
  if (enquadramento === 'desfoque') {
    return (
      `split=2[fa][fb];` +
      `[fa]scale=${par(W / 4)}:${par(H / 4)}:force_original_aspect_ratio=increase,crop=${par(W / 4)}:${par(H / 4)},boxblur=10:2,scale=${W}:${H},eq=brightness=-0.08[fundo];` +
      `[fb]scale=${W}:${H}:force_original_aspect_ratio=decrease[frente];` +
      `[fundo][frente]overlay=(W-w)/2:(H-h)/2,setsar=1${pos}`
    );
  }
  return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${pos}`;
}

function filtrosTexturaEstatica(textura) {
  const f = [];
  if (textura?.vinheta) f.push('vignette=PI/4.5');
  if (textura?.escurecer) f.push(`eq=brightness=-${(Number(textura.escurecer) / 100 * 0.3).toFixed(3)}`);
  return f.join(',');
}

/**
 * Deixa os fundos prontos no tamanho do vídeo.
 * - Só imagens: cada imagem vira um JPG pronto (rápido), trocando a cada música.
 * - Com vídeos: monta um clipe de fundo em loop.
 */
async function prepararFundos({ fundos, W, H, enquadramento, textura, timeline, total, dir, modo, onProgresso, registrarCancelar }) {
  const lista = (fundos || []).filter((f) => f && fs.existsSync(f));
  const estatico = filtrosTexturaEstatica(textura);

  if (!lista.length) {
    // Sem fundo: gradiente escuro simples
    const img = path.join(dir, 'fundo_padrao.jpg');
    const r = rodar(['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=0x0b0b12:c1=0x2a0a12:x0=0:y0=0:x1=${W}:y1=${H}:d=1`, '-frames:v', '1', '-q:v', '2', img], { modo });
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
    return { tipo: 'imagens', lista: path.join(dir, 'fundos.txt'), ...escreverListaImagens([img], timeline, total, dir) };
  }

  if (lista.every(ehImagem)) {
    const prontas = [];
    for (let i = 0; i < lista.length; i++) {
      const saida = path.join(dir, `fundo_${i}.jpg`);
      const r = rodar(['-i', lista[i], '-filter_complex', filtroEnquadrar(W, H, enquadramento, estatico), '-frames:v', '1', '-q:v', '2', saida], { modo });
      registrarCancelar && registrarCancelar(r.cancelar);
      await r.promise;
      prontas.push(saida);
      onProgresso && onProgresso((i + 1) / lista.length);
    }
    return { tipo: 'imagens', ...escreverListaImagens(prontas, timeline, total, dir) };
  }

  // Tem vídeo: normaliza cada item num clipe e junta num loop
  const clipes = [];
  for (let i = 0; i < lista.length; i++) {
    const item = lista[i];
    const saida = path.join(dir, `clipe_${i}.mp4`);
    const comum = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-threads', String(threadsPorModo(modo))];
    let args;
    let dur;
    if (ehImagem(item)) {
      dur = 15;
      args = ['-loop', '1', '-t', String(dur), '-i', item, '-filter_complex', filtroEnquadrar(W, H, enquadramento, estatico), ...comum, saida];
    } else {
      // Vídeo ou GIF. GIF (animado ou parado) não informa duração: repete por 15 s
      const info = await probe(item).catch(() => ({ duracao: 0 }));
      const semDuracao = !(info.duracao > 0.5);
      dur = semDuracao ? 15 : Math.min(info.duracao, 300); // no máximo 5 min por vídeo de fundo
      const entrada = semDuracao ? ['-stream_loop', '-1', '-t', String(dur), '-i', item] : ['-t', String(dur), '-i', item];
      args = [...entrada, '-filter_complex', filtroEnquadrar(W, H, enquadramento, [`fps=${FPS}`, estatico].filter(Boolean).join(',')), ...comum, saida];
    }
    const r = rodar(args, { duracaoTotal: dur, modo, onProgresso: (p) => onProgresso && onProgresso((i + p) / lista.length) });
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
    clipes.push(saida);
  }
  const listaTxt = path.join(dir, 'clipes.txt');
  fs.writeFileSync(listaTxt, clipes.map((c) => `file '${path.basename(c)}'`).join('\n'));
  const loop = path.join(dir, 'fundo_loop.mp4');
  const r = rodar(['-f', 'concat', '-safe', '0', '-i', 'clipes.txt', '-c', 'copy', loop], { modo, cwd: dir });
  registrarCancelar && registrarCancelar(r.cancelar);
  await r.promise;
  return { tipo: 'loop', arquivo: loop };
}

function escreverListaImagens(imagens, timeline, total, dir) {
  // Imagem i aparece durante a música i (em ciclo). Se houver mais imagens que
  // músicas, divide o tempo igualmente entre todas.
  const entradas = [];
  if (imagens.length <= timeline.length && timeline.length) {
    timeline.forEach((m, i) => {
      const fim = i === timeline.length - 1 ? total : timeline[i + 1].inicio;
      entradas.push({ img: imagens[i % imagens.length], dur: Math.max(0.5, fim - m.inicio) });
    });
  } else {
    const d = total / imagens.length;
    imagens.forEach((img) => entradas.push({ img, dur: d }));
  }
  // Junta entradas seguidas com a mesma imagem
  const unidas = [];
  for (const e of entradas) {
    const u = unidas[unidas.length - 1];
    if (u && u.img === e.img) u.dur += e.dur;
    else unidas.push({ ...e });
  }
  const linhas = [];
  unidas.forEach((e) => linhas.push(`file '${path.basename(e.img)}'`, `duration ${e.dur.toFixed(3)}`));
  linhas.push(`file '${path.basename(unidas[unidas.length - 1].img)}'`);
  const lista = path.join(dir, 'fundos.txt');
  fs.writeFileSync(lista, linhas.join('\n'));
  return { lista };
}

/** Cria os mapas (xmap/ymap) que "enrolam" o espectro num círculo — o ffmpeg só faz a consulta, fica leve. */
function criarMapasPolares(dir, S, A, B, r0, r1) {
  const cab = Buffer.from(`P5\n${S} ${S}\n65535\n`);
  const xm = Buffer.alloc(S * S * 2);
  const ym = Buffer.alloc(S * S * 2);
  const c = (S - 1) / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy) / (S / 2);
      let a = Math.atan2(dx, -dy); // 0 = topo, sentido horário
      if (a < 0) a += 2 * Math.PI;
      let sx = Math.min(A - 1, Math.floor((a / (2 * Math.PI)) * A));
      let sy;
      if (r < r0 || r > r1) {
        sx = 65535;
        sy = 65535;
      } else sy = Math.min(B - 1, Math.floor((1 - (r - r0) / (r1 - r0)) * B));
      const i = (y * S + x) * 2;
      xm.writeUInt16BE(sx, i);
      ym.writeUInt16BE(sy, i);
    }
  }
  const xmap = path.join(dir, 'xmap.pgm');
  const ymap = path.join(dir, 'ymap.pgm');
  fs.writeFileSync(xmap, Buffer.concat([cab, xm]));
  fs.writeFileSync(ymap, Buffer.concat([cab, ym]));
  return [xmap, ymap];
}

/**
 * Filtro da onda de áudio conforme o estilo escolhido.
 * `primeiraEntrada` = número da próxima entrada livre do ffmpeg (para os mapas do círculo).
 */
function filtroVisualizador(efeito, W, H, dir, primeiraEntrada = 2) {
  const estilo = efeito?.estilo || 'onda';
  if (estilo === 'nenhum') return null;
  const cor = hexParaFfmpeg(efeito.cor);
  const [r, g, b] = [cor.slice(2, 4), cor.slice(4, 6), cor.slice(6, 8)].map((x) => (parseInt(x, 16) / 255).toFixed(3));
  const num = (v, pad) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? pad : Number(v));
  const pctLarg = Math.max(10, Math.min(100, num(efeito.largura, 60)));
  const larg = par((W * pctLarg) / 100);
  const ganho = (0.4 + (Math.max(0, Math.min(100, num(efeito.intensidade, 70))) / 100) * 3.6).toFixed(2);
  const opac = (Math.max(0, Math.min(100, num(efeito.opacidade, 90))) / 100).toFixed(2);
  const menor = Math.min(W, H);

  // Tudo é desenhado em branco, em meia resolução (bem mais leve), e depois
  // colorido e ampliado.
  let alt;
  let desenho;
  let quadrado = false;
  const entradasExtras = [];
  const hw = (v) => par(v / 2);
  const onda = (w, h, extra) => `showwaves=s=${hw(w)}x${hw(h)}:${extra}:colors=white:rate=${FPS},format=rgba`;
  const espectro = (w, h) => `showfreqs=s=${w}x${h}:mode=bar:fscale=log:ascale=cbrt:win_size=2048:averaging=2:colors=white:rate=${FPS},format=rgba`;

  switch (estilo) {
    case 'barras':
      alt = par(menor * 0.22);
      desenho = espectro(hw(larg), hw(alt));
      break;
    case 'barras_espelho':
      alt = par(menor * 0.3);
      desenho = `${espectro(hw(larg), hw(alt / 2))},split[b1][b2];[b2]vflip[b3];[b1][b3]vstack`;
      break;
    case 'reflexo': {
      // Barras com reflexo apagadinho embaixo, como num piso brilhante
      alt = par(menor * 0.3);
      const hb = hw((alt * 2) / 3);
      desenho = `${espectro(hw(larg), hb)},split[r1][r2];[r2]vflip,crop=iw:${par(hb / 2)}:0:0,colorchannelmixer=aa=0.3[r3];[r1][r3]vstack`;
      break;
    }
    case 'circulo':
    case 'anel_duplo': {
      // Espectro enrolado em círculo (espelhado para ficar simétrico)
      quadrado = true;
      alt = par(menor * (pctLarg / 100) * 0.85);
      const S = hw(alt);
      const A = 720;
      const duplo = estilo === 'anel_duplo';
      const B = duplo ? 60 : 90;
      const [xmap, ymap] = criarMapasPolares(dir, S, A * 2, duplo ? B * 2 : B, duplo ? 0.35 : 0.5, 1);
      entradasExtras.push('-i', xmap, '-i', ymap);
      const i1 = primeiraEntrada;
      const i2 = primeiraEntrada + 1;
      let fonte = `${espectro(A, B)},split[c1][c2];[c2]hflip[c3];[c1][c3]hstack`;
      if (duplo) fonte += `,split[d1][d2];[d2]vflip[d3];[d1][d3]vstack`;
      desenho =
        `${fonte},format=rgba[csrc];` +
        `[${i1}:v]loop=loop=-1:size=1:start=0[cxm];[${i2}:v]loop=loop=-1:size=1:start=0[cym];` +
        `[csrc][cxm][cym]remap=fill=black@0,format=rgba`;
      break;
    }
    case 'nuvem':
      quadrado = true;
      alt = par(menor * 0.42);
      desenho = `avectorscope=s=${hw(alt)}x${hw(alt)}:mode=lissajous:draw=line:scale=sqrt:zoom=1.2:rf=35:gf=35:bf=35:af=35:rate=${FPS},format=rgba,hue=s=0`;
      break;
    case 'onda_dupla':
      alt = par(menor * 0.28);
      desenho = `showwaves=s=${hw(larg)}x${hw(alt)}:mode=cline:split_channels=1:scale=sqrt:draw=full:colors=white|white:rate=${FPS},format=rgba`;
      break;
    case 'linha':
      alt = par(menor * 0.2);
      desenho = onda(larg, alt, 'mode=p2p:scale=sqrt:draw=full');
      break;
    case 'pontos':
      alt = par(menor * 0.2);
      desenho = onda(larg, alt, 'mode=point:scale=sqrt');
      break;
    case 'classico':
    case 'classico_og': {
      // Barrinhas grossas da forma de onda (desenha estreito e estica sem suavizar)
      alt = par(menor * 0.22);
      const escalaOnda = estilo === 'classico' ? 'sqrt' : 'lin';
      desenho = `showwaves=s=${par(larg / 10)}x${hw(alt)}:mode=line:scale=${escalaOnda}:draw=full:colors=white:rate=${FPS},format=rgba,scale=${hw(larg)}:${hw(alt)}:flags=neighbor`;
      break;
    }
    case 'onda_og':
      alt = par(menor * 0.22);
      desenho = onda(larg, alt, 'mode=cline:scale=lin:draw=full');
      break;
    default: // onda
      alt = par(menor * 0.22);
      desenho = onda(larg, alt, 'mode=cline:scale=sqrt:draw=full');
  }
  const largFinal = quadrado ? alt : larg;
  const x = Math.round(Math.max(0, Math.min(W - largFinal, (W * num(efeito.posX, 50)) / 100 - largFinal / 2)));
  const y = Math.round(Math.max(0, Math.min(H - alt, (H * num(efeito.posY, 85)) / 100 - alt / 2)));
  const cadeia =
    `volume=${ganho},aformat=channel_layouts=stereo,${desenho},` +
    `colorchannelmixer=rr=${r}:rg=0:rb=0:gr=0:gg=${g}:gb=0:br=0:bg=0:bb=${b}:aa=${opac},` +
    `format=yuva420p,scale=${largFinal}:${alt}:flags=bilinear`;
  return { cadeia, x, y, entradasExtras };
}

/** Gera o arquivo .ass com nome das músicas e legenda da letra. */
function gerarAss({ W, H, timeline, total, legendas, mostrarNome, legenda }) {
  const tempo = (s) => {
    s = Math.max(0, s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const cs = Math.floor((s % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const corAss = (hex) => {
    const h = String(hex || '#ffffff').replace('#', '');
    return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
  };
  const limpar = (t) => String(t || '').replace(/[{}]/g, '').replace(/\r?\n/g, ' ').replace(/\\/g, '');

  const menor = Math.min(W, H);
  const tamLeg = Math.round(menor * ((Number(legenda?.tamanho) || 100) / 100) * 0.055);
  const tamNome = Math.round(menor * 0.035);
  const alinhamento = { baixo: 2, meio: 5, cima: 8 }[legenda?.posicao || 'baixo'] || 2;
  const margemV = Math.round(H * (legenda?.posicao === 'baixo' ? 0.18 : 0.08));

  const linhas = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Legenda,Montserrat ExtraBold,${tamLeg},${corAss(legenda?.cor || '#ffffff')},&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(tamLeg / 14))},${Math.max(1, Math.round(tamLeg / 24))},${alinhamento},${Math.round(W * 0.08)},${Math.round(W * 0.08)},${margemV},1`,
    `Style: Nome,Montserrat Bold,${tamNome},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,${Math.round(W * 0.035)},${Math.round(W * 0.035)},${Math.round(H * 0.05)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  if (mostrarNome) {
    timeline.forEach((m) => {
      if (m.inicio >= total) return;
      const fim = Math.min(total, m.inicio + 8, m.fim);
      linhas.push(`Dialogue: 1,${tempo(m.inicio + 0.5)},${tempo(fim)},Nome,,0,0,0,,{\\fad(400,600)}♪ ${limpar(m.titulo)}`);
    });
  }
  (legendas || []).forEach((s) => {
    if (s.inicio >= total || !limpar(s.texto).trim()) return;
    linhas.push(`Dialogue: 0,${tempo(s.inicio)},${tempo(Math.min(total, s.fim))},Legenda,,0,0,0,,{\\fad(150,150)}${limpar(s.texto)}`);
  });
  return linhas.join('\n') + '\n';
}

/** Renderização final: fundo + onda + textura + textos + áudio. */
async function renderizarFinal({ fundo, audioArquivo, total, W, H, efeito, textura, assArquivo, fontsDir, saida, encoder, modo, onProgresso, registrarCancelar, dir }) {
  const args = [];
  if (fundo.tipo === 'imagens') {
    args.push('-f', 'concat', '-safe', '0', '-i', path.basename(fundo.lista));
  } else {
    args.push('-stream_loop', '-1', '-i', fundo.arquivo);
  }
  args.push('-i', audioArquivo);

  const partes = [];
  let bg = `[0:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p`;
  partes.push(`${bg}[bg]`);
  if (Number(textura?.granulado) > 0) {
    // Granulado de filme: gera só 1 segundo de ruído e repete (bem mais leve que ruído novo a cada quadro)
    const forca = (0.15 + (Number(textura.granulado) / 100) * 0.45).toFixed(2);
    partes.push(`color=c=0x808080:s=${W}x${H}:r=${FPS}:d=1,format=yuv420p,noise=c0s=35:c0f=t,loop=loop=-1:size=${FPS}:start=0[grao]`);
    partes.push(`[bg][grao]blend=c0_mode=overlay:c0_opacity=${forca}:c1_mode=normal:c1_opacity=1:c2_mode=normal:c2_opacity=1:shortest=1[bgg]`);
  }
  let atual = Number(textura?.granulado) > 0 ? 'bgg' : 'bg';

  const vis = filtroVisualizador(efeito, W, H, dir, 2);
  if (vis) {
    args.push(...vis.entradasExtras);
    partes.push(`[1:a]${vis.cadeia}[onda]`);
    partes.push(`[${atual}][onda]overlay=${vis.x}:${vis.y}:format=yuv420:shortest=1[comonda]`);
    atual = 'comonda';
  }
  if (assArquivo) {
    const rel = path.relative(dir, fontsDir).split(path.sep).join('/');
    partes.push(`[${atual}]subtitles=${path.basename(assArquivo)}:fontsdir=${rel}[comtexto]`);
    atual = 'comtexto';
  }
  partes.push(`[${atual}]format=yuv420p[v]`);

  args.push(
    '-filter_complex', partes.join(';'),
    '-map', '[v]', '-map', '1:a',
    ...argsEncoder(encoder, modo),
    '-g', String(FPS * 2),
    '-c:a', 'copy',
    '-t', total.toFixed(3),
    '-movflags', '+faststart',
    saida
  );
  const r = rodar(args, { duracaoTotal: total, onProgresso, modo, cwd: dir });
  registrarCancelar && registrarCancelar(r.cancelar);
  await r.promise;
}

module.exports = {
  FPS,
  dimensoes,
  dividirEmVideos,
  formatarTempo,
  prepararAudio,
  prepararFundos,
  gerarAss,
  renderizarFinal,
  argsEncoder,
  ehImagem,
  EXT_IMAGEM,
};
