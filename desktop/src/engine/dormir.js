// Sons para dormir: vídeos longos (1 a 10 horas) com cenas lindas em movimento + som ambiente (chuva, mar...)
// e, se quiser, músicas calmas por cima.
//
// Como fica leve mesmo com 10 horas:
// 1) Cada cena vira um clipe curto que emenda nele mesmo sem pulo (loop).
// 2) Entre uma cena e outra há um clipe de transição suave (fade).
// 3) O vídeo final é só a repetição desses clipes, colada SEM recodificar (concat + copy).
//    Então só se codifica alguns segundos de vídeo por cena, não 10 horas.
// 4) O áudio (leve) é gerado direto na duração total, com o som ambiente emendado sem clique.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fal } = require('@fal-ai/client');
const { rodar, probe } = require('./ffmpeg');
const Central = require('./central');
const { gerarMiniatura } = require('./miniatura');
const { gerarCapaChamativa } = require('./capa');

const FPS = 30;
const MODELO_IMAGEM = 'fal-ai/flux-pro/v1.1-ultra';
const MODELO_ANIMACAO = 'fal-ai/wan/v2.2-a14b/image-to-video/turbo';
const EXT_IMG = ['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.bmp'];

// Mesmo lugar, olhares um pouco diferentes: o vídeo fica rico e não parece repetido
const VARIACOES = [
  '',
  ', slightly different camera angle of the same place',
  ', wider establishing view of the same place',
  ', closer cozy detail view of the same place',
  ', same place a little later, softer light',
];

const ehImagem = (p) => EXT_IMG.includes(path.extname(p || '').toLowerCase());
const tamanho = (res) => ({ 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], 2160: [3840, 2160] }[String(res)] || [1920, 1080]);
const barra = (p) => p.replace(/\\/g, '/');

function slug(t) {
  return (
    String(t || 'cena')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'cena'
  );
}

function nomeLivre(pasta, base, ext) {
  let n = path.join(pasta, `${base}${ext}`);
  for (let i = 2; fs.existsSync(n); i++) n = path.join(pasta, `${base} (${i})${ext}`);
  return n;
}

// ---------- Cenas com IA (fal.ai) ----------

/** Gera 1 cena: a imagem (Flux) e, se pedido, a animação em loop (Wan: começa e termina no mesmo quadro). */
async function gerarCena({ falKey, prompt, movimento, indice = 0, animar = true, pasta, onStatus }) {
  if (!falKey) throw new Error('Cadastre a chave da fal.ai em Configurações para gerar as cenas.');
  if (!String(prompt || '').trim()) throw new Error('Escreva a descrição da cena (prompt visual).');
  fal.config({ credentials: falKey });
  fs.mkdirSync(pasta, { recursive: true });
  const marca = `${Date.now()}-${indice + 1}`;

  onStatus && onStatus('Desenhando a cena');
  const textoImagem =
    `${String(prompt).trim()}${VARIACOES[indice % VARIACOES.length]}. ` +
    'Beautiful, serene, relaxing, cinematic composition, natural colors, high detail. No people, no text, no letters, no watermark.';
  const r = await fal.subscribe(MODELO_IMAGEM, {
    input: { prompt: textoImagem, aspect_ratio: '16:9', num_images: 1, output_format: 'jpeg', enable_safety_checker: true },
    logs: false,
    onQueueUpdate: (u) => {
      if (u.status === 'IN_QUEUE') onStatus && onStatus('Na fila da fal.ai (imagem)');
    },
  });
  const urlImg = r?.data?.images?.[0]?.url || r?.images?.[0]?.url;
  if (!urlImg) throw new Error('A fal.ai não devolveu a imagem.');
  const imagem = await Central.baixar(urlImg, path.join(pasta, `cena-${marca}.jpg`));
  if (!animar) return { imagem, video: null, ia: true };

  onStatus && onStatus('Animando a cena (leva uns minutos)');
  const textoMovimento =
    `${String(movimento || 'gentle natural motion: rain, water, leaves and light moving softly').trim()}. ` +
    'Calm, slow, subtle and continuous motion, static camera, no people. The motion loops smoothly and ends exactly like the first frame.';
  const v = await fal.subscribe(MODELO_ANIMACAO, {
    input: { prompt: textoMovimento, image_url: urlImg, end_image_url: urlImg, resolution: '720p', aspect_ratio: '16:9' },
    logs: false,
    onQueueUpdate: (u) => {
      if (u.status === 'IN_QUEUE') onStatus && onStatus('Na fila da fal.ai (animação)');
      if (u.status === 'IN_PROGRESS') onStatus && onStatus('Animando a cena (leva uns minutos)');
    },
  });
  const urlVid = v?.data?.video?.url || v?.video?.url;
  if (!urlVid) return { imagem, video: null, ia: true, aviso: 'A animação falhou; a cena vai com a imagem parada e zoom suave.' };
  const video = await Central.baixar(urlVid, path.join(pasta, `cena-${marca}.mp4`));
  return { imagem, video, ia: true };
}

// ---------- Montagem ----------

const ARGS_X264 = (W, H) => [
  '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-maxrate', W >= 3840 ? '12M' : W >= 2560 ? '6M' : '3500k', '-bufsize', W >= 3840 ? '24M' : '8M',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-g', String(FPS * 2), '-keyint_min', String(FPS * 2), '-sc_threshold', '0',
  '-video_track_timescale', '15360', '-movflags', '+faststart',
];

/** Transforma a cena (vídeo ou imagem) num clipe que emenda nele mesmo, sempre no mesmo formato. */
async function clipeDaCena(cena, destino, { W, H, cancelar }) {
  const ajustar = `fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,format=yuv420p`;
  let args;
  if (cena.video) {
    const info = await probe(cena.video);
    let d = Math.max(1, info.duracao || 5);
    if (cena.ia) {
      // A animação da IA já começa e termina no mesmo quadro: é só repetir
      args = ['-i', cena.video, '-vf', ajustar, '-t', d.toFixed(3)];
    } else {
      // Vídeo do PC: emenda o fim no começo com um fade (sem pulo ao repetir). Usa no máximo 60 s.
      d = Math.min(d, 60);
      const X = Math.min(1.5, d / 4);
      args = [
        '-t', d.toFixed(3), '-i', cena.video, '-filter_complex',
        `[0:v]${ajustar},split=3[a][b][c];` +
          `[a]trim=start=${X}:end=${(d - X).toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS}[meio];` +
          `[b]trim=start=${(d - X).toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS}[fim];` +
          `[c]trim=end=${X},setpts=PTS-STARTPTS,fps=${FPS}[inicio];` +
          `[fim][inicio]xfade=transition=fade:duration=${(X * 0.95).toFixed(3)}:offset=0[emenda];` +
          `[meio][emenda]concat=n=2:v=1:a=0[v]`,
        '-map', '[v]',
      ];
    }
  } else {
    // Imagem parada: zoom bem suave que vai e volta (começa e termina igual), 20 s
    const quadros = FPS * 20;
    args = [
      '-loop', '1', '-framerate', String(FPS), '-t', '20', '-i', cena.imagem, '-vf',
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W * 2}:${H * 2},` +
        `zoompan=z='1+0.06*(1-cos(2*PI*on/${quadros}))/2':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p`,
      '-frames:v', String(quadros),
    ];
  }
  const r = rodar([...args, ...ARGS_X264(W, H), destino], { modo: 'normal' });
  cancelar(r.cancelar);
  await r.promise;
  return (await probe(destino)).duracao;
}

/** Transição: o clipe da cena B com os primeiros segundos misturados com a cena A. */
async function clipeTransicao(clipeA, clipeB, durB, destino, { W, H, cancelar }) {
  const X = Math.min(3, durB / 2);
  const r = rodar(
    [
      '-i', clipeA, '-i', clipeB, '-filter_complex',
      `[0:v]trim=end=${X},setpts=PTS-STARTPTS,fps=${FPS}[a];[1:v]setpts=PTS-STARTPTS,fps=${FPS}[b];[a][b]xfade=transition=fade:duration=${X}:offset=0,format=yuv420p[v]`,
      '-map', '[v]', ...ARGS_X264(W, H), destino,
    ],
    { modo: 'normal' }
  );
  cancelar(r.cancelar);
  await r.promise;
  return (await probe(destino)).duracao;
}

/** Junta os sons ambientes num só e emenda o fim no começo, para repetir sem clique. */
async function prepararAmbiente(arquivos, dir, cancelar) {
  const unido = path.join(dir, 'ambiente-unido.flac');
  const ent = arquivos.flatMap((a) => ['-i', a]);
  let filtro = arquivos.map((_, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`).join(';');
  let ultimo = 'a0';
  for (let i = 1; i < arquivos.length; i++) {
    filtro += `;[${ultimo}][a${i}]acrossfade=d=3:c1=tri:c2=tri[x${i}]`;
    ultimo = `x${i}`;
  }
  let r = rodar([...ent, '-filter_complex', filtro, '-map', `[${ultimo}]`, '-c:a', 'flac', unido]);
  cancelar(r.cancelar);
  await r.promise;

  const d = (await probe(unido)).duracao;
  if (d < 12) return unido; // muito curto para emendar com fade: repete como está
  const X = Math.min(4, d / 4);
  const emendado = path.join(dir, 'ambiente-loop.flac');
  r = rodar([
    '-i', unido, '-filter_complex',
    `[0:a]asplit=3[p][q][r];` +
      `[p]atrim=start=${X}:end=${(d - X).toFixed(3)},asetpts=PTS-STARTPTS[meio];` +
      `[q]atrim=start=${(d - X).toFixed(3)},asetpts=PTS-STARTPTS[fim];` +
      `[r]atrim=end=${X},asetpts=PTS-STARTPTS[inicio];` +
      `[fim][inicio]acrossfade=d=${(X * 0.95).toFixed(3)}:c1=tri:c2=tri[emenda];` +
      `[meio][emenda]concat=n=2:v=0:a=1[s]`,
    '-map', '[s]', '-c:a', 'flac', emendado,
  ]);
  cancelar(r.cancelar);
  await r.promise;
  return emendado;
}

/** Junta as músicas com um fade de 3 s entre elas. */
async function prepararMusicas(arquivos, dir, cancelar) {
  const saida = path.join(dir, 'musicas.flac');
  const ent = arquivos.flatMap((a) => ['-i', a]);
  let filtro = arquivos.map((_, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[m${i}]`).join(';');
  let ultimo = 'm0';
  for (let i = 1; i < arquivos.length; i++) {
    filtro += `;[${ultimo}][m${i}]acrossfade=d=3:c1=tri:c2=tri[y${i}]`;
    ultimo = `y${i}`;
  }
  const r = rodar([...ent, '-filter_complex', filtro, '-map', `[${ultimo}]`, '-c:a', 'flac', saida]);
  cancelar(r.cancelar);
  await r.promise;
  return saida;
}

/** Lista que repete o mesmo arquivo de áudio até cobrir a duração (no lugar de -stream_loop, que trava em alguns PCs). */
async function listaRepetida(arquivo, total, destino) {
  const d = Math.max(1, (await probe(arquivo)).duracao || 1);
  const vezes = Math.ceil(total / d) + 1;
  const linha = `file '${barra(arquivo).replace(/'/g, "'\\''")}'`;
  fs.writeFileSync(destino, Array(vezes).fill(linha).join('\n'));
  return destino;
}

/** Monta a lista de clipes: cada cena fica `trocaSeg` na tela, em ciclo, até completar a duração. */
function montarLista(clipes, transicoes, total, trocaSeg) {
  const n = clipes.length;
  const itens = [];
  let t = 0;
  let bloco = 0;
  while (t < total) {
    const c = bloco % n;
    let noBloco = 0;
    if (bloco > 0 && n > 1) {
      const tr = transicoes[c];
      itens.push(tr.arquivo);
      t += tr.duracao;
      noBloco += tr.duracao;
    }
    while (noBloco < trocaSeg && t < total) {
      itens.push(clipes[c].arquivo);
      t += clipes[c].duracao;
      noBloco += clipes[c].duracao;
    }
    bloco++;
  }
  return { itens, duracao: t };
}

/**
 * Gera o vídeo completo.
 * opcoes: { cenas:[{imagem, video, ia}], ambientes:[caminho], musicas:[caminho], volAmbiente (0-150), volMusica (0-150),
 *           horas, trocaMin, resolucao, pasta, nome, onProgresso(fase, pct, texto), registrarCancelar(fn) }
 */
async function gerarVideo(op) {
  const { cenas = [], ambientes = [], musicas = [], pasta, nome } = op;
  if (!cenas.length) throw new Error('Coloque pelo menos uma cena.');
  if (!ambientes.length && !musicas.length) throw new Error('Escolha o som ambiente (chuva, mar...) ou as músicas.');
  const total = Math.round(Math.max(0.05, Number(op.horas) || 8) * 3600);
  const trocaSeg = Math.max(60, (Number(op.trocaMin) || 25) * 60);
  const [W, H] = tamanho(op.resolucao);
  const avisar = (fase, pct, texto) => op.onProgresso && op.onProgresso(fase, Math.max(0, Math.min(1, pct)), texto);
  let cancelarAtual = null;
  let cancelado = false;
  const cancelar = (fn) => (cancelarAtual = fn);
  op.registrarCancelar &&
    op.registrarCancelar(() => {
      cancelado = true;
      cancelarAtual && cancelarAtual();
    });
  const checar = () => {
    if (cancelado) throw new Error('CANCELADO');
  };

  // Se o ffmpeg ficar 3 min sem avançar, para e avisa (em vez de ficar travado horas)
  const vigia = {
    ultimo: Date.now(),
    mexeu() {
      this.ultimo = Date.now();
    },
    esperar(r, oque) {
      this.ultimo = Date.now();
      return new Promise((ok, falha) => {
        let parado = false;
        const t = setInterval(() => {
          if (Date.now() - this.ultimo > 3 * 60e3) {
            parado = true;
            clearInterval(t);
            r.cancelar();
          }
        }, 10e3);
        r.promise.then(
          (v) => (clearInterval(t), ok(v)),
          (e) => {
            clearInterval(t);
            if (parado && !cancelado) falha(new Error(`A geração de ${oque} parou de avançar. Tente de novo; se repetir, tire a última música ou som da lista (pode estar com defeito).`));
            else falha(e);
          }
        );
      });
    },
  };

  fs.mkdirSync(pasta, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'youvideo-dormir-'));
  try {
    // 1) Clipes das cenas (peso 15%)
    const clipes = [];
    for (const [i, cena] of cenas.entries()) {
      checar();
      avisar('cenas', (i / cenas.length) * 0.15, `Preparando a cena ${i + 1} de ${cenas.length}`);
      const arquivo = path.join(tmp, `cena-${i}.mp4`);
      clipes.push({ arquivo, duracao: await clipeDaCena(cena, arquivo, { W, H, cancelar }) });
    }
    const transicoes = [];
    if (clipes.length > 1) {
      for (let i = 0; i < clipes.length; i++) {
        checar();
        avisar('cenas', 0.15 + (i / clipes.length) * 0.05, `Criando as transições (${i + 1} de ${clipes.length})`);
        const anterior = clipes[(i - 1 + clipes.length) % clipes.length];
        const arquivo = path.join(tmp, `transicao-${i}.mp4`);
        transicoes.push({ arquivo, duracao: await clipeTransicao(anterior.arquivo, clipes[i].arquivo, clipes[i].duracao, arquivo, { W, H, cancelar }) });
      }
    }
    const lista = montarLista(clipes, transicoes, total, trocaSeg);
    const listaTxt = path.join(tmp, 'lista.txt');
    fs.writeFileSync(listaTxt, lista.itens.map((a) => `file '${barra(a).replace(/'/g, "'\\''")}'`).join('\n'));
    const duracao = Math.min(total, lista.duracao);

    // 2) Áudio (peso 35%)
    checar();
    avisar('audio', 0.2, 'Preparando o som');
    const ent = [];
    const partes = [];
    const volA = (Number(op.volAmbiente ?? 100) / 100).toFixed(2);
    const volM = (Number(op.volMusica ?? 35) / 100).toFixed(2);
    if (ambientes.length) {
      const amb = await prepararAmbiente(ambientes, tmp, cancelar);
      ent.push('-f', 'concat', '-safe', '0', '-i', await listaRepetida(amb, duracao, path.join(tmp, 'ambiente.txt')));
      partes.push(`[${partes.length}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${volA}[s${partes.length}]`);
    }
    checar();
    if (musicas.length) {
      const mus = await prepararMusicas(musicas, tmp, cancelar);
      ent.push('-f', 'concat', '-safe', '0', '-i', await listaRepetida(mus, duracao, path.join(tmp, 'musicas.txt')));
      partes.push(`[${partes.length}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${volM}[s${partes.length}]`);
    }
    const fadeOut = Math.max(0, duracao - 10).toFixed(2);
    const juntar = partes.length > 1 ? `[s0][s1]amix=inputs=2:normalize=0:duration=shortest,` : `[s0]`;
    const filtroAudio = `${partes.join(';')};${juntar}${partes.length > 1 ? '' : 'anull,'}afade=t=in:d=5,afade=t=out:st=${fadeOut}:d=10,alimiter=limit=0.95:level=0[sa]`;
    const audio = path.join(tmp, 'audio.m4a');
    let r = rodar([...ent, '-filter_complex', filtroAudio, '-map', '[sa]', '-t', duracao.toFixed(2), '-c:a', 'aac', '-b:a', '192k', audio], {
      duracaoTotal: duracao,
      onProgresso: (x) => (vigia.mexeu(), avisar('audio', 0.2 + x * 0.35, `Gerando o som (${Math.round(x * 100)}%)`)),
    });
    cancelar(r.cancelar);
    await vigia.esperar(r, 'o som');

    // 3) Junta tudo sem recodificar o vídeo (peso 45%)
    checar();
    const arquivo = nomeLivre(pasta, nome || 'sons-para-dormir', '.mp4');
    r = rodar(
      ['-f', 'concat', '-safe', '0', '-i', listaTxt, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-t', duracao.toFixed(2), '-movflags', '+faststart', arquivo],
      { duracaoTotal: duracao, onProgresso: (x) => (vigia.mexeu(), avisar('juntar', 0.55 + x * 0.43, `Montando o vídeo final (${Math.round(x * 100)}%)`)) }
    );
    cancelar(r.cancelar);
    await vigia.esperar(r, 'o vídeo final');

    // 4) Capa: a imagem da primeira cena, com o mesmo nome do vídeo (o "Subir p/ YouTube" encontra sozinho)
    avisar('capa', 0.99, 'Fazendo a capa');
    const capa = arquivo.slice(0, -4) + '.jpg';
    const baseCapa = cenas[0].imagem || cenas[0].video;
    try {
      if (op.capaFrase && op.fontsDir) {
        await gerarCapaChamativa(baseCapa, { usarIa: false, frase: op.capaFrase, destaque: op.capaDestaque, suave: true, fontsDir: op.fontsDir, destino: capa });
      } else {
        await gerarMiniatura(baseCapa, capa);
      }
    } catch {
      try {
        await gerarMiniatura(baseCapa, capa);
      } catch {
        /* sem capa: o YouTube escolhe um quadro */
      }
    }
    avisar('pronto', 1, 'Pronto');
    return { arquivo, duracao, capa: fs.existsSync(capa) ? capa : null };
  } catch (e) {
    if (cancelado) throw new Error('CANCELADO');
    throw e;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
}

// ---------- Som ambiente e música com IA (fal.ai) ----------
const MODELO_SOM = 'fal-ai/elevenlabs/sound-effects/v2';
const MODELO_MUSICA = 'fal-ai/elevenlabs/music/v2.5';

/** Som ambiente (chuva, mar, fogo...): até 22 s, já emendável. Várias versões juntas evitam a cara de loop curto. */
async function gerarSom({ falKey, texto, indice = 0, pasta, onStatus }) {
  if (!falKey) throw new Error('Cadastre a chave da fal.ai em Configurações para gerar o som.');
  if (!String(texto || '').trim()) throw new Error('Escreva como é o som ambiente.');
  fal.config({ credentials: falKey });
  fs.mkdirSync(pasta, { recursive: true });
  onStatus && onStatus('Gerando o som');
  const r = await fal.subscribe(MODELO_SOM, {
    input: { text: `${String(texto).trim()}. Continuous, steady, no music, no voices.`, duration_seconds: 22, loop: true, prompt_influence: 0.45, output_format: 'mp3_44100_192' },
    logs: false,
  });
  const url = r?.data?.audio?.url || r?.audio?.url;
  if (!url) throw new Error('A fal.ai não devolveu o som.');
  const arquivo = await Central.baixar(url, path.join(pasta, `som-${Date.now()}-${indice + 1}.mp3`));
  return { arquivo, titulo: `Som ambiente ${indice + 1}`, duracao: (await probe(arquivo)).duracao };
}

/** Música instrumental calma (ElevenLabs Music). */
async function gerarMusica({ falKey, prompt, segundos = 180, indice = 0, pasta, onStatus }) {
  if (!falKey) throw new Error('Cadastre a chave da fal.ai em Configurações para gerar as músicas.');
  if (!String(prompt || '').trim()) throw new Error('Escreva o estilo da música.');
  fal.config({ credentials: falKey });
  fs.mkdirSync(pasta, { recursive: true });
  onStatus && onStatus('Compondo a música');
  const r = await fal.subscribe(MODELO_MUSICA, {
    input: {
      prompt: `${String(prompt).trim()}. Instrumental only, no vocals, no drums, slow and soft from start to end, gentle fade in and fade out.`,
      music_length_ms: Math.round(Math.min(600, Math.max(30, segundos)) * 1000),
      force_instrumental: true,
      output_format: 'mp3_44100_192',
    },
    logs: false,
  });
  const url = r?.data?.audio?.url || r?.audio?.url;
  if (!url) throw new Error('A fal.ai não devolveu a música.');
  const arquivo = await Central.baixar(url, path.join(pasta, `musica-${Date.now()}-${indice + 1}.mp3`));
  return { arquivo, titulo: `Música calma ${indice + 1}`, duracao: (await probe(arquivo)).duracao };
}

module.exports = { gerarCena, gerarSom, gerarMusica, gerarVideo, montarLista, slug, ehImagem };
