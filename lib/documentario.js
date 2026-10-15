// Documentários para dormir (canal "Noites na História").
// Os roteiros já vêm escritos (lib/documentarioEpisodios): aqui eles viram roteiro da Fábrica,
// a voz é gerada devagar e com pausas (ElevenLabs, em pedaços), as cenas usam vídeos e fotos
// REAIS (Pexels e Wikimedia Commons, nada de imagem de IA) e a capa é uma foto real com texto.
//
// Formato do texto de cada episódio:
//   # Nome do capítulo        -> vira capítulo na descrição do YouTube (não é narrado)
//   @ snow falling forest     -> começa uma cena nova; o texto depois do @ é a busca da imagem/vídeo
//   @ foto: Lofotr longhouse  -> "foto:" procura primeiro foto de lugar histórico (Wikimedia)
//   qualquer outra linha      -> narração da cena atual; [pausa] vira um respiro de 1,5 s na voz

const PAUSA = /\[pausa\]/gi;
const TAMANHO_PEDACO = 2500; // pedaços menores = voz mais estável na ElevenLabs
const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';
const CAUDA_SEGUNDOS = 600; // 10 min de lareira e vento depois da narração (quem dorme continua ouvindo)
const CAUDA_BUSCA = 'fireplace crackling dark';

/**
 * Som de lareira com vento (22 s, gerado uma vez na ElevenLabs e guardado), repetido no fim de cada episódio.
 * Devolve { url, duracao } ou null se não der (aí o vídeo sai sem a cauda, só com a narração).
 */
async function somAmbiente() {
  try {
    const { getDb } = await import('./firebase-admin');
    const ref = getDb().collection('youvideo_config').doc('documentario');
    const salvo = (await ref.get()).data();
    if (salvo?.somAmbienteUrl) return { url: salvo.somAmbienteUrl, duracao: salvo.somAmbienteDuracao || 22 };
    const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text: 'Gentle crackling fireplace, soft winter wind outside, calm and cozy ambience for sleeping, steady, no music, no voices',
        duration_seconds: 22,
        prompt_influence: 0.4,
      }),
    });
    if (!r.ok) return null;
    const { put } = await import('@vercel/blob');
    const blob = await put(`doc-ambiente-lareira.mp3`, Buffer.from(await r.arrayBuffer()), {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    await ref.set({ somAmbienteUrl: blob.url, somAmbienteDuracao: 22 }, { merge: true });
    return { url: blob.url, duracao: 22 };
  } catch {
    return null;
  }
}

export const textoLimpo = (t) => String(t || '').replace(PAUSA, ' ').replace(/[ \t]+/g, ' ').replace(/ +([.,!?;:])/g, '$1').trim();
export const textoVoz = (t) => String(t || '').replace(PAUSA, ' <break time="1.5s" /> ').replace(/[ \t]+/g, ' ').trim();

/** Lê o texto do episódio: capítulos, cenas (busca + narração). */
export function lerEpisodio(ep) {
  const capitulos = [];
  const cenas = [];
  let atual = null;
  for (const bruta of String(ep.texto || '').split('\n')) {
    const linha = bruta.trim();
    if (!linha) continue;
    if (linha.startsWith('# ')) {
      capitulos.push({ titulo: linha.slice(2).trim(), cena: cenas.length });
      continue;
    }
    if (linha.startsWith('@ ')) {
      atual = { busca: linha.slice(2).trim(), paragrafos: [] };
      cenas.push(atual);
      continue;
    }
    if (!atual) {
      atual = { busca: ep.capa || ep.titulo, paragrafos: [] };
      cenas.push(atual);
    }
    atual.paragrafos.push(linha);
  }
  return {
    capitulos,
    cenas: cenas
      .filter((c) => c.paragrafos.length)
      .map((c) => ({ busca: c.busca, texto: c.paragrafos.join('\n') })),
  };
}

const RODAPE = '🌙 Noites na História — documentários calmos para você relaxar e dormir. Novo episódio todos os dias.';

/** Monta o roteiro no formato da Fábrica a partir do episódio escrito. */
export function roteiroDoEpisodio(ep) {
  const { capitulos, cenas } = lerEpisodio(ep);
  const narracao = cenas.map((c) => c.texto).join('\n\n');
  return {
    titulo: String(ep.titulo).slice(0, 100),
    thumbnailTitulo: String(ep.thumb || '').toUpperCase(),
    thumbnailSubtitulo: String(ep.thumbSub || ''),
    arte: String(ep.arte || ''), // cena da pintura da capa (em inglês, para o Flux)
    descricao: [ep.resumo, 'Sem música alta, sem cortes bruscos. Só história real, contada com calma, para você relaxar ou adormecer.', RODAPE]
      .filter(Boolean)
      .join('\n\n'),
    tags: ep.tags || [],
    capa: ep.capa || '',
    capitulos,
    narracao, // com [pausa]: a voz usa textoVoz(), a legenda/descrição usam textoLimpo()
    cenas: cenas.map((c) => ({ descricao: c.busca, busca: c.busca, textoNarrado: c.texto })),
  };
}

/**
 * Sincroniza a imagem com a fala: cada cena começa no segundo em que a primeira palavra dela
 * é falada (tempo das palavras devolvido pela ElevenLabs). textos = texto narrado de cada cena,
 * palavras = [{ start }] na ordem da narração. Devolve [{ start, length }] por cena.
 * Se o texto das cenas e a narração tiverem contagens um pouco diferentes, distribui na proporção.
 */
export function temposDasCenas(textos, palavras, duracao) {
  const validas = (palavras || []).filter((p) => p && p.start != null);
  if (!validas.length || !textos.length) {
    const fatia = duracao / Math.max(1, textos.length);
    return textos.map((_, i) => ({ start: Number((i * fatia).toFixed(2)), length: Number(fatia.toFixed(2)) }));
  }
  const contar = (t) => textoLimpo(t).split(/\s+/).filter(Boolean).length;
  const porCena = textos.map(contar);
  const totalEsperado = porCena.reduce((a, b) => a + b, 0) || 1;
  const fator = validas.length / totalEsperado;
  let acumulado = 0;
  const inicios = porCena.map((n) => {
    const idx = Math.min(validas.length - 1, Math.round(acumulado * fator));
    acumulado += n;
    // um pouquinho antes da palavra, para a imagem já estar na tela quando a frase começa
    return idx <= 0 ? 0 : Math.max(0, validas[idx].start - 0.3);
  });
  return inicios.map((start, i) => {
    const fim = i < inicios.length - 1 ? inicios[i + 1] : duracao;
    return { start: Number(start.toFixed(2)), length: Number(Math.max(0.5, fim - start).toFixed(2)) };
  });
}

/** Peso de cada trecho no tempo (caracteres + cada pausa vale ~1,5 s ≈ 20 caracteres). */
const peso = (t) => textoLimpo(t).length + (String(t).match(PAUSA) || []).length * 20;

/** Divide a narração em pedaços (sempre em fim de parágrafo) para a ElevenLabs. */
export function pedacosDaNarracao(narracao) {
  const paragrafos = String(narracao).split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const pedacos = [];
  let atual = '';
  for (const p of paragrafos) {
    const candidato = atual ? `${atual}\n${p}` : p;
    if (textoLimpo(candidato).length > TAMANHO_PEDACO && atual) {
      pedacos.push(atual);
      atual = p;
    } else atual = candidato;
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}

function palavrasDoAlinhamento(alignment) {
  if (!alignment?.characters) return [];
  const { characters, character_start_times_seconds: ini, character_end_times_seconds: fim } = alignment;
  const palavras = [];
  let atual = '';
  let inicio = null;
  let dentroDeTag = false;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (c === '<') dentroDeTag = true;
    if (dentroDeTag) {
      if (c === '>') dentroDeTag = false;
      continue;
    }
    if (c.trim() === '') {
      if (atual) palavras.push({ texto: atual, start: inicio, end: fim[i - 1] });
      atual = '';
      inicio = null;
      continue;
    }
    if (inicio === null) inicio = ini[i];
    atual += c;
  }
  if (atual) palavras.push({ texto: atual, start: inicio, end: fim[characters.length - 1] });
  return palavras.filter((p) => p.start != null && p.end != null);
}

/**
 * Um passo da voz: gera os próximos pedaços (até ~100 s de trabalho) e guarda o que já foi feito.
 * Devolve o objeto para gravar no item da fila.
 */
export async function passoVozDocumentario(item) {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY não configurada na Vercel.');
  const { put } = await import('@vercel/blob');
  const vozId = item.vozId || process.env.DOCUMENTARIO_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const pedacos = pedacosDaNarracao(item.roteiro.narracao);
  const feitos = [...(item.narracaoParcial?.segmentos || [])];
  const comeco = Date.now();

  while (feitos.length < pedacos.length && Date.now() - comeco < 100e3) {
    const i = feitos.length;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozId}/with-timestamps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text: textoVoz(pedacos[i]),
        model_id: 'eleven_multilingual_v2',
        // Voz de documentário para dormir: lenta, estável, sem exagero de emoção
        voice_settings: { stability: 0.65, similarity_boost: 0.75, style: 0.05, use_speaker_boost: true, speed: 0.88 },
        // Continuidade entre os pedaços (a entonação não "recomeça" a cada pedaço)
        ...(i > 0 ? { previous_text: textoLimpo(pedacos[i - 1]).slice(-400) } : {}),
        ...(i < pedacos.length - 1 ? { next_text: textoLimpo(pedacos[i + 1]).slice(0, 400) } : {}),
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      if (/quota|credits|limit/i.test(txt)) throw new Error('Acabaram os créditos da ElevenLabs (voz). Aumente o plano e tente de novo.');
      throw new Error(`Voz, pedaço ${i + 1}/${pedacos.length}: ${txt.slice(0, 200)}`);
    }
    const d = await r.json();
    const audio = Buffer.from(d.audio_base64, 'base64');
    const blob = await put(`doc-voz-${Date.now()}-${i}.mp3`, audio, {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });
    const palavras = palavrasDoAlinhamento(d.alignment);
    const fimFala = palavras.length ? palavras[palavras.length - 1].end : 0;
    // O áudio pode terminar com uma pausa depois da última palavra: usa o fim real do alinhamento
    const fimAudio = Math.max(fimFala, ...(d.alignment?.character_end_times_seconds || [0]));
    // Guarda só o início de cada palavra (para sincronizar as cenas): o texto já está no roteiro,
    // e episódios de 1h30 têm mais de 10 mil palavras (o documento do banco tem limite de tamanho)
    feitos.push({ url: blob.url, length: Number((fimAudio + 0.6).toFixed(2)), inicios: palavras.map((p) => Number(p.start.toFixed(2))) });
  }

  if (feitos.length < pedacos.length) {
    return { narracaoParcial: { segmentos: feitos, total: pedacos.length } };
  }

  // Tudo pronto: junta os pedaços numa linha do tempo só
  const audioSegments = [];
  const palavras = []; // { start } de cada palavra, na linha do tempo inteira
  let cursor = 0;
  for (const s of feitos) {
    audioSegments.push({ url: s.url, start: Number(cursor.toFixed(2)), length: s.length });
    for (const ini of s.inicios || (s.palavras || []).map((p) => p.start)) palavras.push({ start: ini + cursor });
    cursor += s.length;
  }
  const duracao = cursor;

  // Cauda: 10 min de lareira e vento depois da narração (a última cena continua na tela)
  const ambiente = await somAmbiente();
  let cauda = null;
  if (ambiente) {
    for (let t = 0; t < CAUDA_SEGUNDOS - 0.5; t += ambiente.duracao) {
      audioSegments.push({ url: ambiente.url, start: Number((duracao + t).toFixed(2)), length: Math.min(ambiente.duracao, CAUDA_SEGUNDOS - t) });
    }
    cauda = { start: Number(duracao.toFixed(2)), length: CAUDA_SEGUNDOS };
  }

  // Cada cena começa no segundo exato em que a sua primeira palavra é falada
  const tempos = temposDasCenas(item.roteiro.cenas.map((c) => c.textoNarrado), palavras, duracao);
  const cenas = item.roteiro.cenas.map((c, i) => ({ ...c, ...tempos[i] }));

  // Capítulos com o tempo de verdade (o YouTube cria os capítulos sozinho a partir da descrição)
  const caps = (item.roteiro.capitulos || []).filter((c) => cenas[c.cena]);
  let descricao = item.roteiro.descricao || '';
  if (caps.length >= 3) {
    const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const linhas = caps.map((c, i) => `${mmss(i === 0 ? 0 : cenas[c.cena].start)} ${c.titulo}`);
    if (cauda) linhas.push(`${mmss(cauda.start)} Lareira e vento para dormir`);
    const [abertura, ...resto] = descricao.split('\n\n');
    descricao = [abertura, `Capítulos:\n${linhas.join('\n')}`, ...resto].join('\n\n');
  }

  return {
    // Documentário vai sem legenda na tela: não precisa guardar as palavras
    narracao: { audioUrl: audioSegments[0].url, audioSegments, palavras: [] },
    narracaoParcial: null,
    duracaoNarracao: Math.round(duracao),
    cauda,
    'roteiro.cenas': cenas,
    'roteiro.descricao': descricao.slice(0, 4900),
    status: 'voz_ok',
  };
}

// ───────────────────────── Imagens e vídeos reais ─────────────────────────

async function pexelsVideo(busca, usados) {
  if (!process.env.PEXELS_API_KEY) return null;
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(busca)}&orientation=landscape&per_page=15`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!r.ok) return null;
  const d = await r.json();
  for (const v of d.videos || []) {
    const id = `pv${v.id}`;
    if (usados.has(id)) continue;
    const arquivos = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width >= f.height);
    const bom = arquivos.filter((f) => f.width >= 1280 && f.width <= 1920).sort((a, b) => a.width - b.width)[0] || arquivos.filter((f) => f.width >= 960).sort((a, b) => a.width - b.width)[0];
    if (!bom) continue;
    return { id, videoUrl: bom.link, imageUrl: v.image || null, duracao: Number(v.duration) || null, credito: null };
  }
  return null;
}

async function pexelsFoto(busca, usados) {
  if (!process.env.PEXELS_API_KEY) return null;
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(busca)}&orientation=landscape&per_page=15`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!r.ok) return null;
  const d = await r.json();
  for (const f of d.photos || []) {
    const id = `pf${f.id}`;
    if (usados.has(id)) continue;
    return { id, imageUrl: f.src?.large2x || f.src?.original, credito: null };
  }
  return null;
}

const LICENCA_LIVRE = /public domain|domínio público|^pd|cc0|^cc[ -]by(?:[ -]sa)?[ -]\d/i;
const semHtml = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function commonsFoto(busca, usados) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12' +
    `&gsrsearch=${encodeURIComponent(`${busca} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const d = await r.json();
  const paginas = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const p of paginas) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const id = `wc${p.pageid}`;
    if (usados.has(id)) continue;
    if ((info.width || 0) < 1000 || (info.width || 0) < (info.height || 0)) continue; // só paisagem e com boa resolução
    const meta = info.extmetadata || {};
    const licenca = semHtml(meta.LicenseShortName?.value);
    if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
    const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
    const nome = semHtml(meta.ObjectName?.value || p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')).slice(0, 90);
    return { id, imageUrl: info.thumburl || info.url, credito: `${nome} — ${autor} — ${licenca} — Wikimedia Commons` };
  }
  return null;
}

/** Acha um vídeo ou foto real para a busca. "foto:" na frente = lugar histórico (Wikimedia primeiro). */
export async function buscarMidiaReal(buscaBruta, usados = new Set()) {
  const ehFoto = /^foto:/i.test(buscaBruta);
  const busca = buscaBruta.replace(/^foto:\s*/i, '').trim();
  const tentativas = ehFoto ? [commonsFoto, pexelsFoto, pexelsVideo] : [pexelsVideo, pexelsFoto, commonsFoto];
  for (const fn of tentativas) {
    try {
      const m = await fn(busca, usados);
      if (m) return m;
    } catch {
      /* tenta a próxima fonte */
    }
  }
  // Nada com a busca inteira: tenta só as 2 primeiras palavras
  const curta = busca.split(/\s+/).slice(0, 2).join(' ');
  if (curta !== busca) {
    for (const fn of [pexelsVideo, pexelsFoto]) {
      try {
        const m = await fn(curta, usados);
        if (m) return m;
      } catch {
        /* segue */
      }
    }
  }
  return null;
}

/** Um passo das imagens: busca até 10 cenas por vez (o cron continua de onde parou). */
export async function passoMidiaDocumentario(item) {
  const cenas = item.roteiro.cenas || [];
  const feitas = [...(item.arquivosParciais || [])];
  const usados = new Set(feitas.map((a) => a.midiaId).filter(Boolean));
  let capaUrl = item.capaUrl || null;
  if (!capaUrl && item.roteiro.capa) {
    // Capa: foto de banco profissional primeiro (cores e luz mais fortes), Wikimedia se não achar
    const busca = item.roteiro.capa.replace(/^foto:\s*/i, '');
    for (const fn of [pexelsFoto, commonsFoto]) {
      try {
        const m = await fn(busca, new Set());
        if (m?.imageUrl) {
          capaUrl = m.imageUrl;
          break;
        }
      } catch {
        /* tenta a próxima */
      }
    }
  }
  const comeco = Date.now();
  while (feitas.length < cenas.length && Date.now() - comeco < 90e3 && feitas.length - (item.arquivosParciais || []).length < 10) {
    const c = cenas[feitas.length];
    const m = await buscarMidiaReal(c.busca || c.descricao, usados);
    if (m) usados.add(m.id);
    feitas.push({
      cena: c.busca || c.descricao,
      start: c.start ?? null,
      length: c.length ?? null,
      ...(m
        ? {
            midiaId: m.id,
            imageUrl: m.imageUrl || null,
            ...(m.videoUrl ? { videoUrl: m.videoUrl, videoLoop: true, duracao: m.duracao || null } : {}),
            ...(m.credito ? { credito: m.credito } : {}),
          }
        : { erro: 'Nenhuma imagem real encontrada para esta cena.' }),
    });
  }
  if (feitas.length < cenas.length) return { arquivosParciais: feitas, ...(capaUrl ? { capaUrl } : {}) };

  // Cena da cauda (lareira): cobre os 10 min de som ambiente depois da narração
  if (item.cauda && !feitas.some((a) => a.cauda)) {
    const m = await buscarMidiaReal(CAUDA_BUSCA, usados);
    if (m) {
      feitas.push({
        cena: CAUDA_BUSCA,
        cauda: true,
        textoNarrado: '',
        start: item.cauda.start,
        length: item.cauda.length,
        midiaId: m.id,
        imageUrl: m.imageUrl || null,
        ...(m.videoUrl ? { videoUrl: m.videoUrl, videoLoop: true, duracao: m.duracao || null } : {}),
      });
    }
  }

  const validas = feitas.filter((a) => a.videoUrl || a.imageUrl);
  if (!validas.length) throw new Error('Nenhuma imagem real foi encontrada (confira a PEXELS_API_KEY na Vercel).');
  // Créditos das fotos do Wikimedia (CC BY / CC BY-SA pedem o nome do autor)
  const creditos = [...new Set(feitas.map((a) => a.credito).filter(Boolean))];
  const atualizacao = {
    arquivos: feitas,
    arquivosParciais: null,
    capaUrl: capaUrl || validas.find((a) => a.imageUrl)?.imageUrl || null,
    status: 'imagens_ok',
  };
  if (creditos.length) {
    atualizacao['roteiro.descricao'] = `${item.roteiro.descricao}\n\nImagens: Pexels e Wikimedia Commons.\n${creditos.join('\n')}`.slice(0, 4900);
  }
  return atualizacao;
}

// ───────────────────────── Thumbnail ─────────────────────────

/**
 * Pintura épica da capa (estilo das capas de "história para dormir" que mais dão certo):
 * cena de época em óleo, personagem forte de um lado, luz dourada, lado do texto mais escuro.
 * Devolve a URL da pintura ou null (aí a capa usa a foto real).
 */
async function pinturaDaCapa(arte) {
  if (!arte || !process.env.FLUX_API_KEY) return null;
  const prompt =
    `Epic cinematic digital oil painting, historical documentary book cover art. ${arte}. ` +
    'The main character is on the RIGHT third of the image, seen from the chest up, strong expressive face lit by warm golden light. ' +
    'The LEFT half of the image is darker, calmer and less detailed (space for a title). ' +
    'Warm sepia, amber and gold color palette, dramatic chiaroscuro, rich painterly brush texture, highly detailed, masterpiece. ' +
    'No text, no letters, no words, no logo, no watermark, no frame.';
  const r = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
    method: 'POST',
    headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width: 1344, height: 768 }),
  });
  const d = await r.json();
  if (!r.ok) return null;
  for (let i = 0; i < 60; i++) {
    await new Promise((ok) => setTimeout(ok, 1000));
    const q = await (await fetch(d.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } })).json();
    if (q.status === 'Ready' && q.result?.sample) {
      const { put } = await import('@vercel/blob');
      const img = Buffer.from(await (await fetch(q.result.sample)).arrayBuffer());
      const blob = await put(`doc-arte-${Date.now()}.jpg`, img, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
      return blob.url;
    }
    if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(q.status)) return null;
  }
  return null;
}

/**
 * Capa do episódio (1280×720), no estilo das capas de história que mais dão certo no YouTube:
 * pintura épica de época (ou a foto real, se a pintura falhar), título com o nome do tema em letras
 * medievais enormes cor de pergaminho dourado, subtítulo pequeno embaixo e a moeda do canal no canto.
 */
export async function thumbDocumentario({ fotoUrl, texto, subtitulo = '', arte = '' }) {
  const fundo = (await pinturaDaCapa(arte).catch(() => null)) || fotoUrl;
  if (!fundo) return null;
  if (!texto) return fundo;
  try {
    // Texto montado aqui mesmo (sem Shotstack): letras medievais Cinzel, moeda do canal e moldura dourada
    const { montarCapa } = await import('./capaDocumentario');
    const jpg = await montarCapa({ fundoUrl: fundo, texto, subtitulo });
    const { put } = await import('@vercel/blob');
    const blob = await put(`doc-capa-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
    return blob.url;
  } catch {
    /* sem texto: fica a pintura (ou a foto) */
  }
  return fundo;
}
