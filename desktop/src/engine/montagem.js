// Monta no PC os vídeos criados no site (histórias animadas, narradas...),
// no lugar da Shotstack: grátis e sem limite de duração.
// O site entrega uma "receita" (.youvideo.json) com as cenas, o áudio e as palavras da narração.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { rodar, probe } = require('./ffmpeg');
const R = require('./render');
const Central = require('./central');
const { filtroEfeitos } = require('./efeitos');

const FPS = R.FPS;

/** Lê e confere uma receita vinda do site. */
function lerReceita(arquivo) {
  const r = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  if (r?.tipo !== 'youvideo-montagem' || !Array.isArray(r.clipes) || !r.clipes.length) {
    throw new Error('Esse arquivo não é uma receita de vídeo do Youvideo.');
  }
  return r;
}

const nomeCache = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 20) + (path.extname(new URL(url).pathname).slice(0, 6) || '');

function ehListaStreaming(arq) {
  try {
    const fd = fs.openSync(arq, 'r');
    const b = Buffer.alloc(16);
    fs.readSync(fd, b, 0, 16, 0);
    fs.closeSync(fd);
    return b.toString('utf8').startsWith('#EXTM3U');
  } catch {
    return false;
  }
}

/**
 * Trailer em streaming (HLS .m3u8, como a Steam entrega hoje): o ffmpeg baixa e junta num .mp4,
 * só a imagem e no máximo 2 minutos (é o que as cenas usam).
 */
async function baixarStreaming(url, destino) {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) return destino;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = destino.replace(/\.mp4$/, '.parcial.mp4');
  // Sem -map: o ffmpeg escolhe sozinho a versão de maior resolução do trailer
  await rodar(['-f', 'hls', '-i', url, '-t', '120', '-an', '-c', 'copy', tmp]).promise;
  fs.renameSync(tmp, destino);
  return destino;
}

/** Baixa tudo o que a receita usa (cada link uma vez só). */
async function baixarTudo(receita, dirCache, onProgresso, checar) {
  const urls = [...new Set([...(receita.audio || []).map((a) => a.url), ...receita.clipes.map((c) => c.url), receita.musica?.url].filter(Boolean))];
  const locais = {};
  for (let i = 0; i < urls.length; i++) {
    checar && checar();
    const comoMp4 = path.join(dirCache, 'montagem', nomeCache(urls[i]).replace(/\.m3u8$/i, '') + '.hls.mp4');
    if (/\.m3u8(\?|$)/i.test(urls[i])) locais[urls[i]] = await baixarStreaming(urls[i], comoMp4);
    else {
      const arq = await Central.baixar(urls[i], path.join(dirCache, 'montagem', nomeCache(urls[i])), (x) => onProgresso && onProgresso((i + x) / urls.length));
      // Veio uma lista de streaming (#EXTM3U) em vez do vídeo: o ffmpeg baixa de verdade a partir do link
      locais[urls[i]] = ehListaStreaming(arq) ? await baixarStreaming(urls[i], comoMp4) : arq;
    }
    onProgresso && onProgresso((i + 1) / urls.length);
  }
  return locais;
}

/** Junta os pedaços da narração, cada um no seu tempo. */
async function prepararAudio(receita, locais, dir, { modo, registrarCancelar }) {
  const saida = path.join(dir, 'narracao.m4a');
  const pedacos = (receita.audio || []).filter((a) => a.url);
  if (!pedacos.length) throw new Error('A receita veio sem áudio.');
  const args = [];
  pedacos.forEach((p) => args.push('-i', locais[p.url]));
  const partes = pedacos.map((p, i) => {
    const ms = Math.max(0, Math.round((Number(p.start) || 0) * 1000));
    const corte = p.length ? `atrim=0:${Number(p.length).toFixed(3)},` : '';
    // volume: efeito sonoro mais baixo que as falas (desenho infantil)
    const vol = p.volume != null && Number(p.volume) !== 1 ? `volume=${Math.max(0, Math.min(2, Number(p.volume))).toFixed(2)},` : '';
    // fade: some devagar nos últimos N segundos (música de encerramento do desenho infantil)
    const fd = p.fade && p.length ? `afade=t=out:st=${Math.max(0, Number(p.length) - Number(p.fade)).toFixed(2)}:d=${Number(p.fade).toFixed(2)},` : '';
    return `[${i}:a]${corte}${vol}${fd}aresample=48000,adelay=${ms}:all=1[a${i}]`;
  });
  partes.push(`${pedacos.map((_, i) => `[a${i}]`).join('')}amix=inputs=${pedacos.length}:normalize=0:dropout_transition=0,apad[voz]`);
  // Música de fundo (documentário): repetida com emenda suave pelo vídeo todo, bem baixinha por baixo da narração
  const musica = receita.musica?.url && locais[receita.musica.url];
  let durMusica = 0;
  if (musica) {
    try {
      durMusica = (await probe(musica)).duracao || 0;
    } catch {
      durMusica = 0;
    }
  }
  if (musica && durMusica > 20) {
    const X = 4; // segundos de emenda entre uma volta e outra
    const voltas = Math.min(60, Math.ceil((receita.duracao + X) / (durMusica - X)));
    const base = pedacos.length;
    for (let v = 0; v < voltas; v++) args.push('-i', musica);
    let atual = `${base}:a`;
    for (let v = 1; v < voltas; v++) {
      partes.push(`[${atual}][${base + v}:a]acrossfade=d=${X}:c1=tri:c2=tri[mc${v}]`);
      atual = `mc${v}`;
    }
    const vol = Math.max(0.02, Math.min(0.5, Number(receita.musica.volume) || 0.1));
    const fim = Math.max(0, receita.duracao - 5);
    partes.push(`[${atual}]aresample=48000,atrim=0:${receita.duracao.toFixed(3)},volume=${vol.toFixed(2)},afade=t=in:d=3,afade=t=out:st=${fim.toFixed(2)}:d=5[mus]`);
    partes.push('[voz][mus]amix=inputs=2:normalize=0:duration=first:dropout_transition=0[mix]');
  } else {
    partes.push('[voz]anull[mix]');
  }
  args.push('-filter_complex', partes.join(';'), '-map', '[mix]', '-t', receita.duracao.toFixed(3), '-c:a', 'aac', '-b:a', '192k', saida);
  const r = rodar(args, { modo, duracaoTotal: receita.duracao });
  registrarCancelar && registrarCancelar(r.cancelar);
  await r.promise;
  return saida;
}

/**
 * Deixa as cenas em sequência, sem buraco nem sobreposição, e junta as partes
 * repetidas de um mesmo clipe em loop numa só (fica um arquivo por cena).
 */
function organizarCenas(receita) {
  const clipes = [...receita.clipes].filter((c) => c.url && c.length > 0).sort((a, b) => a.start - b.start);
  const cenas = [];
  for (const c of clipes) {
    const ultima = cenas[cenas.length - 1];
    if (ultima && ultima.tipo === 'video' && c.tipo === 'video' && ultima.url === c.url && (ultima.inicio || 0) === (c.inicio || 0) && Math.abs(ultima.start + ultima.length - c.start) < 0.1) {
      ultima.length += c.length;
      ultima.repetir = true;
    } else cenas.push({ ...c });
  }
  cenas.forEach((c, i) => {
    const fim = i < cenas.length - 1 ? cenas[i + 1].start : receita.duracao;
    if (i === 0) c.start = 0;
    c.length = Math.max(0.2, fim - c.start);
  });
  return cenas;
}

/** Gera o vídeo de fundo: cada cena no tamanho certo, depois tudo emendado. */
async function prepararFundo(receita, locais, dir, W, H, { modo, onProgresso, registrarCancelar, checar }) {
  const cenas = organizarCenas(receita);
  const comum = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
  const cobrir = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  const feitos = [];
  const total = cenas.reduce((a, c) => a + c.length, 0);
  let pronto = 0;
  for (let i = 0; i < cenas.length; i++) {
    checar && checar();
    const c = cenas[i];
    const arq = locais[c.url];
    const saida = path.join(dir, `cena_${String(i).padStart(4, '0')}.mp4`);
    const L = c.length.toFixed(3);
    let args;
    // Games num Short: imagem ou vídeo DEITADO aparece inteiro (sem cortar o nome do jogo), com ele mesmo desfocado no fundo
    let encaixar = false;
    if (receita.encaixar && H > W) {
      const dim = await probe(arq).catch(() => null);
      encaixar = !!dim && dim.largura > dim.altura * 1.15;
    }
    if (encaixar && c.tipo === 'video') {
      let ini = Number(c.inicio) || 0;
      if (ini > 0) {
        const dur = (await probe(arq).catch(() => ({ duracao: 0 }))).duracao || 0;
        ini = dur > 4 ? ini % Math.max(1, dur - 2) : 0;
      }
      args = [
        '-stream_loop', '-1', ...(ini > 0 ? ['-ss', ini.toFixed(2)] : []), '-i', arq, '-t', L,
        '-filter_complex',
        `[0:v]fps=${FPS},split[fa][fb];[fa]${cobrir(W, H)},boxblur=24:2,eq=brightness=-0.12[fundo];` +
          `[fb]scale=${W}:-2,setsar=1[frente];[fundo][frente]overlay=(W-w)/2:(H-h)/2,format=yuv420p[saida]`,
        '-map', '[saida]', ...comum, saida,
      ];
    } else if (encaixar) {
      // Imagem: zoom lento só na frente; o fundo desfocado fica parado
      const quadros = Math.max(1, Math.round(c.length * FPS));
      const z = c.efeito === 'zoomOut' ? `1.10-0.10*on/${quadros}` : `1+0.10*on/${quadros}`;
      const altFrente = Math.round((W * 9) / 16 / 2) * 2;
      args = [
        '-loop', '1', '-framerate', String(FPS), '-t', L, '-i', arq, '-filter_complex',
        `[0:v]split[fa][fb];[fa]${cobrir(W, H)},boxblur=24:2,eq=brightness=-0.12[fundo];` +
          `[fb]${cobrir(W * 2, altFrente * 2)},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${altFrente}:fps=${FPS},setsar=1[frente];` +
          `[fundo][frente]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[saida]`,
        '-map', '[saida]', '-frames:v', String(quadros), ...comum, saida,
      ];
    } else if (c.tipo === 'video') {
      // Clipe animado: repete emendado pelo tempo todo da cena (loop), nunca para
      // Trailer de jogo: começa no trecho pedido (pula logos e repete menos o começo)
      // (se o trailer for mais curto que o ponto pedido, dá a volta: nunca pula para depois do fim)
      let ini = Number(c.inicio) || 0;
      if (ini > 0) {
        const dur = (await probe(arq).catch(() => ({ duracao: 0 }))).duracao || 0;
        ini = dur > 4 ? ini % Math.max(1, dur - 2) : 0;
      }
      const pular = ini > 0 ? ['-ss', ini.toFixed(2)] : [];
      args = ['-stream_loop', '-1', ...pular, '-i', arq, '-t', L, '-vf', `fps=${FPS},${cobrir(W, H)}`, ...comum, saida];
    } else {
      // Imagem: aproximação/afastamento lento, igual ao site
      const quadros = Math.max(1, Math.round(c.length * FPS));
      const z = c.efeito === 'zoomOut' ? `1.12-0.12*on/${quadros}` : `1+0.12*on/${quadros}`;
      const efeitos = c.movimento ? filtroEfeitos({ W, H, fps: FPS, movimento: c.movimento }) : null;
      if (efeitos) {
        // Documentário: chuva caindo, névoa andando, luz de vela... por cima da foto, além do zoom
        args = [
          '-loop', '1', '-framerate', String(FPS), '-t', L, '-i', arq, '-filter_complex',
          `[0:v]${cobrir(W * 2, H * 2)},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p[base];${efeitos}`,
          '-map', '[saida]', '-frames:v', String(quadros), ...comum, saida,
        ];
      } else args = [
        '-loop', '1', '-framerate', String(FPS), '-t', L, '-i', arq,
        '-vf', `${cobrir(W * 2, H * 2)},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`,
        ...comum, saida,
      ];
    }
    const r = rodar(args, { modo, duracaoTotal: c.length, onProgresso: (x) => onProgresso && onProgresso((pronto + x * c.length) / total) });
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
    pronto += c.length;
    feitos.push(saida);
  }
  fs.writeFileSync(path.join(dir, 'cenas.txt'), feitos.map((f) => `file '${path.basename(f)}'`).join('\n'));
  const fundo = path.join(dir, 'fundo.mp4');
  const r = rodar(['-f', 'concat', '-safe', '0', '-i', 'cenas.txt', '-c', 'copy', fundo], { modo, cwd: dir });
  registrarCancelar && registrarCancelar(r.cancelar);
  await r.promise;
  const primeiraImagem = cenas.find((c) => c.tipo === 'imagem' && locais[c.url])?.url || receita.clipes.find((c) => c.imagem)?.imagem;
  return { fundo, capaOrigem: primeiraImagem ? locais[primeiraImagem] : null };
}

/** Legenda estilo karaokê: blocos de palavras em caixa alta, a palavra falada em destaque. */
function gerarAssNarracao({ W, H, palavras, duracao, marca, curto, cta, textos }) {
  const tempo = (s) => {
    s = Math.max(0, s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const cs = Math.floor((s % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const limpar = (t) => String(t || '').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const menor = Math.min(W, H);
  const tam = Math.round(menor * (curto ? 0.062 : 0.058));
  const margemV = Math.round(H * (curto ? 0.24 : 0.1));
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
    `Style: Legenda,Montserrat ExtraBold,${tam},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(3, Math.round(tam / 11))},${Math.max(1, Math.round(tam / 20))},2,${Math.round(W * 0.07)},${Math.round(W * 0.07)},${margemV},1`,
    `Style: Marca,Montserrat Bold,${Math.round(menor * 0.028)},&H70FFFFFF,&H000000FF,&H80000000,&H00000000,-1,0,0,0,100,100,0,0,1,1,1,9,${Math.round(W * 0.03)},${Math.round(W * 0.03)},${Math.round(H * 0.04)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  if (marca) linhas.push(`Dialogue: 1,${tempo(0)},${tempo(duracao)},Marca,,0,0,0,,${limpar(marca)}`);
  // Chamada da empresa (ex.: WhatsApp) em destaque nos últimos segundos, numa faixa no alto da tela
  if (cta && duracao > 6) {
    const tamCta = Math.round(menor * (curto ? 0.07 : 0.06));
    linhas.splice(linhas.indexOf('[Events]') - 1, 0,
      `Style: Cta,Montserrat ExtraBold,${tamCta},&H00FFFFFF,&H000000FF,&H001E7A12,&H001E7A12,-1,0,0,0,100,100,0,0,3,${Math.round(tamCta * 0.35)},0,8,${Math.round(W * 0.06)},${Math.round(W * 0.06)},${Math.round(H * (curto ? 0.16 : 0.1))},1`);
    linhas.push(`Dialogue: 2,${tempo(Math.max(0, duracao - 5))},${tempo(duracao)},Cta,,0,0,0,,{\\fad(400,0)}${limpar(cta)}`);
  }

  // Quadrinho explicativo (documentário): caixa escura no canto de baixo, com faixa amarela do lado,
  // nome do lugar em amarelo e até duas linhas explicando
  const quadros = (textos || []).filter((t) => t && t.titulo && t.start != null && t.length > 1 && t.start < duracao);
  if (quadros.length) {
    const tamT = Math.round(menor * (curto ? 0.042 : 0.036));
    const tamX = Math.round(tamT * 0.74);
    linhas.splice(linhas.indexOf('[Events]') - 1, 0,
      `Style: QuadroFundo,Montserrat Bold,10,&H00000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
      `Style: Quadro,Montserrat Bold,${tamX},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,0,${Math.max(1, Math.round(tamX / 14))},7,0,0,0,1`);
    const quebrar = (t, max) => {
      const ls = [''];
      for (const p of String(t || '').split(/\s+/)) {
        if ((ls[ls.length - 1] + ' ' + p).trim().length > max && ls[ls.length - 1]) ls.push(p);
        else ls[ls.length - 1] = (ls[ls.length - 1] + ' ' + p).trim();
      }
      return ls.filter(Boolean).slice(0, 2);
    };
    const sem = (t) => String(t || '').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim();
    const mx = Math.round(W * 0.04);
    const my = Math.round(H * (curto ? 0.2 : 0.085));
    const pad = Math.round(tamX * 0.75);
    const barra = Math.max(5, Math.round(tamT * 0.16));
    for (const t of quadros) {
      const fim = Math.min(duracao, t.start + t.length);
      const titulo = sem(t.titulo).toUpperCase();
      const corpo = t.texto ? quebrar(sem(t.texto), curto ? 30 : 44) : [];
      // Tamanho da caixa pela largura aproximada do texto (Montserrat Bold: ~0,5 da altura por letra maiúscula, ~0,38 por minúscula)
      const largura = Math.min(W - 2 * mx, Math.round(Math.max(titulo.length * tamT * 0.52, ...corpo.map((l) => l.length * tamX * 0.38)) + pad * 2 + barra));
      const altura = Math.round(pad * 2 + tamT * 1.15 + corpo.length * tamX * 1.3);
      const x = mx;
      const y = H - my - altura;
      const caixa = `m 0 0 l ${largura} 0 ${largura} ${altura} 0 ${altura}`;
      const faixa = `m 0 0 l ${barra} 0 ${barra} ${altura} 0 ${altura}`;
      const fad = '\\fad(500,500)';
      linhas.push(`Dialogue: 3,${tempo(t.start)},${tempo(fim)},QuadroFundo,,0,0,0,,{${fad}\\pos(${x},${y})\\1c&H000000&\\1a&H40&\\p1}${caixa}{\\p0}`);
      linhas.push(`Dialogue: 4,${tempo(t.start)},${tempo(fim)},QuadroFundo,,0,0,0,,{${fad}\\pos(${x},${y})\\1c&H0AD6FF&\\1a&H00&\\p1}${faixa}{\\p0}`);
      const texto = `{\\fs${tamT}\\c&H0AD6FF&\\b1}${titulo}{\\r}` + (corpo.length ? `\\N{\\fs${Math.round(tamT * 0.3)}} \\N{\\fs${tamX}}${corpo.join('\\N')}` : '');
      linhas.push(`Dialogue: 5,${tempo(t.start)},${tempo(fim)},Quadro,,0,0,0,,{${fad}\\pos(${x + barra + pad},${y + pad})}${texto}`);
    }
  }

  const validas = (palavras || []).filter((p) => p && p.start != null && p.end != null && p.end > p.start && String(p.texto || '').trim());
  const POR_BLOCO = curto ? 3 : 4;
  let fimAnterior = 0;
  for (let i = 0; i < validas.length; i += POR_BLOCO) {
    const bloco = validas.slice(i, i + POR_BLOCO);
    bloco.forEach((p, k) => {
      const ini = Math.max(p.start, fimAnterior);
      const prox = bloco[k + 1] ? bloco[k + 1].start : p.end + 0.15;
      const fim = Math.min(Math.max(prox, ini + 0.08), duracao);
      if (ini >= duracao || fim <= ini) return;
      fimAnterior = fim;
      // Palavra falada em amarelo com contorno roxo; as outras em branco
      const texto = bloco
        .map((q, j) => (j === k ? `{\\c&H0AD6FF&\\3c&HC92F8B&}${limpar(q.texto)}{\\r}` : limpar(q.texto)))
        .join(' ');
      linhas.push(`Dialogue: 0,${tempo(ini)},${tempo(fim)},Legenda,,0,0,0,,${texto}`);
    });
  }
  return linhas.join('\n');
}


/**
 * Modo "juntar": clipes que já têm o próprio áudio (ex.: oração falada da D-ID),
 * um atrás do outro. Devolve o vídeo final pronto.
 */
async function juntarClipes(receita, locais, dir, W, H, { modo, onProgresso, registrarCancelar, checar }) {
  const clipes = receita.clipes.filter((c) => c.url && locais[c.url]);
  const feitos = [];
  let total = 0;
  const infos = [];
  for (const c of clipes) {
    const i = await probe(locais[c.url]);
    infos.push(i);
    total += i.duracao || 0;
  }
  let pronto = 0;
  for (let i = 0; i < clipes.length; i++) {
    checar && checar();
    const arq = locais[clipes[i].url];
    const dur = infos[i].duracao || 1;
    const saida = path.join(dir, `parte_${String(i).padStart(4, '0')}.mp4`);
    const enq = await R.resolverEnquadramento(arq, W, H, 'auto');
    const args = ['-i', arq];
    const temAudio = infos[i].temAudio;
    if (!temAudio) args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    args.push(
      '-filter_complex', `[0:v]${R.filtroEnquadrar(W, H, enq, `fps=${FPS}`)},format=yuv420p[v]`,
      '-map', '[v]', '-map', temAudio ? '0:a' : '1:a',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', saida
    );
    const r = rodar(args, { modo, duracaoTotal: dur, onProgresso: (x) => onProgresso && onProgresso((pronto + x * dur) / (total || 1)) });
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
    pronto += dur;
    feitos.push(saida);
  }
  fs.writeFileSync(path.join(dir, 'partes.txt'), feitos.map((f) => `file '${path.basename(f)}'`).join('\n'));
  const final = path.join(dir, 'final.mp4');
  const r = rodar(['-f', 'concat', '-safe', '0', '-i', 'partes.txt', '-c', 'copy', '-movflags', '+faststart', final], { modo, cwd: dir });
  registrarCancelar && registrarCancelar(r.cancelar);
  await r.promise;
  return { final, duracao: total };
}

module.exports = { juntarClipes, lerReceita, baixarTudo, prepararAudio, prepararFundo, gerarAssNarracao, organizarCenas };
