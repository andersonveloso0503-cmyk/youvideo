// Monta no PC os vídeos criados no site (histórias animadas, narradas...),
// no lugar da Shotstack: grátis e sem limite de duração.
// O site entrega uma "receita" (.youvideo.json) com as cenas, o áudio e as palavras da narração.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { rodar, probe } = require('./ffmpeg');
const R = require('./render');
const Central = require('./central');

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

/** Baixa tudo o que a receita usa (cada link uma vez só). */
async function baixarTudo(receita, dirCache, onProgresso, checar) {
  const urls = [...new Set([...(receita.audio || []).map((a) => a.url), ...receita.clipes.map((c) => c.url)].filter(Boolean))];
  const locais = {};
  for (let i = 0; i < urls.length; i++) {
    checar && checar();
    locais[urls[i]] = await Central.baixar(urls[i], path.join(dirCache, 'montagem', nomeCache(urls[i])), (x) => onProgresso && onProgresso((i + x) / urls.length));
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
    return `[${i}:a]${corte}aresample=48000,adelay=${ms}:all=1[a${i}]`;
  });
  partes.push(`${pedacos.map((_, i) => `[a${i}]`).join('')}amix=inputs=${pedacos.length}:normalize=0:dropout_transition=0,apad[mix]`);
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
    if (ultima && ultima.tipo === 'video' && c.tipo === 'video' && ultima.url === c.url && Math.abs(ultima.start + ultima.length - c.start) < 0.1) {
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
    if (c.tipo === 'video') {
      // Clipe animado: repete emendado pelo tempo todo da cena (loop), nunca para
      args = ['-stream_loop', '-1', '-i', arq, '-t', L, '-vf', `fps=${FPS},${cobrir(W, H)}`, ...comum, saida];
    } else {
      // Imagem: aproximação/afastamento lento, igual ao site
      const quadros = Math.max(1, Math.round(c.length * FPS));
      const z = c.efeito === 'zoomOut' ? `1.12-0.12*on/${quadros}` : `1+0.12*on/${quadros}`;
      args = [
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
function gerarAssNarracao({ W, H, palavras, duracao, marca, curto, cta }) {
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
