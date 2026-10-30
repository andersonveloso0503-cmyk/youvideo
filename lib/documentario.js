// Documentários para dormir (canal "Noites na História").
// Os roteiros já vêm escritos (lib/documentarioEpisodios): aqui eles viram roteiro da Fábrica,
// a voz é gerada devagar e com pausas (ElevenLabs, em pedaços), as cenas usam vídeos e fotos
// REAIS (Pexels e Wikimedia Commons, nada de imagem de IA) e a capa é uma foto real com texto.
//
// Formato do texto de cada episódio:
//   # Nome do capítulo        -> vira capítulo na descrição do YouTube (não é narrado)
//   @ snow falling forest     -> começa uma cena nova; o texto depois do @ é a busca da imagem/vídeo
//   @ foto: Lofotr longhouse  -> "foto:" procura primeiro foto de lugar histórico (Wikimedia)
//   @ ilustração: <prompt>    -> a cena é ilustrada pela IA (Flux), sem procurar foto; com "epoca" no episódio, no visual daquela época
//   @ vídeo: <busca>          -> vídeo real (Wikimedia Commons, Pixabay, Pexels), conferido pela época do episódio
//   @ vídeo atual: <busca>    -> vídeo real de hoje (ex.: o lugar como é agora), sem a regra da época
//   ... | Título | Explicação -> quadrinho explicativo no canto da tela (ex.: "| Mercado Público | Inaugurado em 1869")
//   qualquer outra linha      -> narração da cena atual; [pausa] vira um respiro de 1,5 s na voz

import { ehCenaDeJogo, nomeDoJogo, midiaDeJogo, capaDeJogo, creditoGames, vozDosGames } from './games';

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

/**
 * Música de fundo do documentário (instrumental, sem voz), feita uma vez por estilo no Google Lyria e guardada.
 * Devolve a URL ou null (aí o vídeo sai só com a narração).
 */
export async function musicaDeFundo(estilo, tipo = 'documentario') {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !estilo) return null;
  try {
    const { getDb } = await import('./firebase-admin');
    const ref = getDb().collection('youvideo_config').doc('documentario');
    const chave = 'musica_' + String(estilo).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
    const salvo = (await ref.get()).data();
    if (salvo?.[chave]) return salvo[chave];
    const modelo = process.env.LYRIA_MODEL || 'lyria-3.5';
    const prompt =
      `Instrumental background score for a narrated ${tipo === 'games' ? 'video game news video' : 'history documentary'}. ${estilo}. ` +
      'No vocals, no choir, no lyrics. Steady and understated, no sudden drums or loud hits, so a narrator can be heard clearly over it. ' +
      'Smooth ending that can loop. Length about 150 seconds.';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const audio = (d?.candidates?.[0]?.content?.parts || []).map((x) => x.inlineData || x.inline_data).find((x) => x?.data);
    if (!audio) return null;
    const { put } = await import('@vercel/blob');
    const mime = audio.mimeType || audio.mime_type || 'audio/mpeg';
    const blob = await put(`doc-musica-${chave}.${/wav/.test(mime) ? 'wav' : 'mp3'}`, Buffer.from(audio.data, 'base64'), {
      access: 'public',
      contentType: mime,
      token: process.env.MEDIA_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    await ref.set({ [chave]: blob.url }, { merge: true });
    return blob.url;
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
      const [busca, titulo, ...resto] = linha.slice(2).split(' | ').map((x) => x.trim());
      atual = { busca, paragrafos: [], ...(titulo ? { local: { titulo: titulo.slice(0, 40), texto: resto.join(' ').slice(0, 90) } } : {}) };
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
      .map((c) => ({ busca: c.busca, texto: c.paragrafos.join('\n'), ...(c.local ? { local: c.local } : {}) })),
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
    descricao: ep.descricao
      ? String(ep.descricao) // nova fase (catástrofes/cidades): descrição pronta, com chamada para inscrição
      : [ep.resumo, 'Sem música alta, sem cortes bruscos. Só história real, contada com calma, para você relaxar ou adormecer.', RODAPE]
          .filter(Boolean)
          .join('\n\n'),
    epoca: String(ep.epoca || ''), // ex.: "Porto Alegre em 1941": a conferência aceita bonde, carro e poste daquela época
    ritmo: ep.ritmo === 'documentario' || ep.ritmo === 'games' ? ep.ritmo : 'dormir',
    semCauda: ep.cauda === false, // sem os 10 min de lareira no fim
    playlist: ep.playlist?.titulo ? { titulo: String(ep.playlist.titulo).slice(0, 150), descricao: String(ep.playlist.descricao || '') } : null,
    tags: ep.tags || [],
    ...(ep.voz ? { voz: String(ep.voz) } : {}), // voz da ElevenLabs só deste episódio (opcional)
    capa: ep.capa || '',
    capitulos,
    narracao, // com [pausa]: a voz usa textoVoz(), a legenda/descrição usam textoLimpo()
    musica: String(ep.musica || ''), // estilo da música de fundo (em inglês, para o Lyria); vazio = sem música
    cenas: cenas.map((c) => ({ descricao: c.busca, busca: c.busca, textoNarrado: c.texto, ...(c.local ? { local: c.local } : {}) })),
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
  // Quando as palavras vêm com o texto (vídeos da Fábrica), procura a 1ª frase de cada cena na fala:
  // assim a imagem acerta mesmo se a IA escreveu a narração um pouco diferente do texto das cenas.
  const norm = (w) => String(w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const comTexto = validas.every((p) => p.texto != null);
  const falados = comTexto ? validas.map((p) => norm(p.texto)) : null;
  const acharCena = (texto, esperado, minimo) => {
    const alvo = textoLimpo(texto).split(/\s+/).map(norm).filter(Boolean).slice(0, 4);
    if (alvo.length < 2) return null;
    let melhor = null;
    const janela = Math.max(25, Math.round(validas.length * 0.08));
    for (let j = Math.max(minimo, esperado - janela); j <= Math.min(validas.length - 1, esperado + janela); j++) {
      let acertos = 0;
      for (let k = 0; k < alvo.length; k++) if (falados[j + k] === alvo[k]) acertos++;
      const nota = acertos * 100 - Math.abs(j - esperado);
      if (acertos >= Math.min(3, alvo.length) && (!melhor || nota > melhor.nota)) melhor = { j, nota };
    }
    return melhor ? melhor.j : null;
  };
  let acumulado = 0;
  let ultimoIdx = 0;
  const inicios = porCena.map((n, i) => {
    let idx = Math.min(validas.length - 1, Math.round(acumulado * fator));
    if (falados && i > 0) {
      const achado = acharCena(textos[i], idx, ultimoIdx + 1);
      if (achado != null) idx = achado;
    }
    if (i > 0 && idx <= ultimoIdx) idx = Math.min(validas.length - 1, ultimoIdx + 1);
    ultimoIdx = idx;
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

export function palavrasDoAlinhamento(alignment) {
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
  // Games: voz própria do canal (jovem e animada), nunca a voz calma dos documentários
  const vozId =
    item.vozId ||
    item.roteiro?.voz ||
    (item.games ? await vozDosGames().catch(() => null) : null) ||
    (item.games ? process.env.ELEVENLABS_VOICE_ID : process.env.DOCUMENTARIO_VOICE_ID || process.env.ELEVENLABS_VOICE_ID) ||
    '21m00Tcm4TlvDq8ikWAM';
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
        // Para dormir: lenta e estável. Documentário (catástrofes): ritmo normal, um pouco mais de expressão
        // Games: ritmo de notícia, mais animado
        voice_settings:
          item.roteiro.ritmo === 'games'
            ? { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed: 1.05 }
            : item.roteiro.ritmo === 'documentario'
            ? { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.96 }
            : { stability: 0.65, similarity_boost: 0.75, style: 0.05, use_speaker_boost: true, speed: 0.88 },
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
  const ambiente = item.roteiro.semCauda ? null : await somAmbiente();
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

const LIMITE_PEXELS = 'LIMITE_PEXELS';

// Cada fonte devolve até 4 candidatos (o primeiro nem sempre combina: a IA confere um por um)
async function pexelsVideo(busca, usados) {
  if (!process.env.PEXELS_API_KEY) return [];
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(busca)}&orientation=landscape&per_page=15`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (r.status === 429) throw new Error(LIMITE_PEXELS);
  if (!r.ok) return [];
  const d = await r.json();
  const lista = [];
  for (const v of d.videos || []) {
    const id = `pv${v.id}`;
    if (usados.has(id)) continue;
    const arquivos = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width >= f.height);
    const bom = arquivos.filter((f) => f.width >= 1280 && f.width <= 1920).sort((a, b) => a.width - b.width)[0] || arquivos.filter((f) => f.width >= 960).sort((a, b) => a.width - b.width)[0];
    if (!bom) continue;
    lista.push({ id, videoUrl: bom.link, imageUrl: v.image || null, conferir: v.image || null, duracao: Number(v.duration) || null, credito: null });
    if (lista.length >= 4) break;
  }
  return lista;
}

/** Vídeos livres do Wikimedia Commons (filmes antigos de domínio público, reportagens com licença CC). */
async function commonsVideo(busca, usados) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=15' +
    `&gsrsearch=${encodeURIComponent(`${busca} filetype:video`)}&prop=videoinfo&viprop=url|size|derivatives|extmetadata&viurlwidth=640`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const d = await r.json();
  const paginas = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const lista = [];
  for (const p of paginas) {
    const info = p.videoinfo?.[0];
    if (!info) continue;
    const id = `wv${p.pageid}`;
    if (usados.has(id)) continue;
    if ((info.width || 0) < (info.height || 0) || (info.duration || 0) < 4) continue; // só deitado e com alguns segundos
    const meta = info.extmetadata || {};
    const licenca = semHtml(meta.LicenseShortName?.value);
    if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
    // Versão convertida pelo próprio Wikimedia (mais leve que o original): a de até 720p
    const derivadas = (info.derivatives || []).filter((v) => /webm|mp4/i.test(v.type || '') && Number(v.height) >= 360);
    const escolhida = derivadas.filter((v) => Number(v.height) <= 720).sort((a, b) => Number(b.height) - Number(a.height))[0] || null;
    const videoUrl = escolhida?.src || info.url;
    if (!videoUrl || !info.thumburl) continue;
    const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
    const nome = semHtml(meta.ObjectName?.value || p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')).slice(0, 90);
    lista.push({ id, videoUrl, imageUrl: info.thumburl, conferir: info.thumburl, duracao: Number(info.duration) || null, credito: `${nome} — ${autor} — ${licenca} — Wikimedia Commons` });
    if (lista.length >= 4) break;
  }
  return lista;
}

async function pixabayVideo(busca, usados) {
  if (!process.env.PIXABAY_API_KEY) return [];
  const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY)}&q=${encodeURIComponent(busca.slice(0, 100))}&per_page=15&safesearch=true`);
  if (!r.ok) return [];
  const d = await r.json();
  const lista = [];
  for (const v of d.hits || []) {
    const id = `xv${v.id}`;
    if (usados.has(id) || (v.duration || 0) < 5) continue;
    const f = v.videos?.large?.url ? v.videos.large : v.videos?.medium;
    if (!f?.url || f.width < f.height) continue;
    const capa = f.thumbnail || v.videos?.medium?.thumbnail || null;
    lista.push({ id, videoUrl: f.url, imageUrl: capa, conferir: capa, duracao: Number(v.duration) || null, credito: null });
    if (lista.length >= 4) break;
  }
  return lista;
}

async function pexelsFoto(busca, usados) {
  if (!process.env.PEXELS_API_KEY) return [];
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(busca)}&orientation=landscape&per_page=15`, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (r.status === 429) throw new Error(LIMITE_PEXELS);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.photos || [])
    .filter((f) => !usados.has(`pf${f.id}`))
    .slice(0, 4)
    .map((f) => ({ id: `pf${f.id}`, imageUrl: f.src?.large2x || f.src?.original, conferir: f.src?.medium || f.src?.large, credito: null }));
}

const LICENCA_LIVRE = /public domain|domínio público|^pd|cc0|^cc[ -]by(?:[ -]sa)?[ -]\d/i;
const semHtml = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function commonsFoto(busca, usados, larguraMinima = 1000) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12' +
    `&gsrsearch=${encodeURIComponent(`${busca} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const d = await r.json();
  const paginas = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const lista = [];
  for (const p of paginas) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const id = `wc${p.pageid}`;
    if (usados.has(id)) continue;
    if ((info.width || 0) < larguraMinima || (info.width || 0) < (info.height || 0)) continue; // só paisagem e com boa resolução
    const meta = info.extmetadata || {};
    const licenca = semHtml(meta.LicenseShortName?.value);
    if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
    const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
    const nome = semHtml(meta.ObjectName?.value || p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')).slice(0, 90);
    lista.push({ id, imageUrl: info.thumburl || info.url, conferir: info.thumburl || info.url, credito: `${nome} — ${autor} — ${licenca} — Wikimedia Commons` });
    if (lista.length >= 4) break;
  }
  return lista;
}

/**
 * A IA (Gemini) olha a imagem e diz se ela mostra o que está sendo narrado, na época certa.
 * Recusa coisa moderna (carro, luz elétrica, celular, pôster, comida moderna, gente fantasiada em feira…).
 * Sem a chave do Gemini, aceita tudo (como era antes).
 */
export function conferidorDeCena({ tema, trecho, busca, epoca = '', atual = false, lugar = '' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const modelo = process.env.GEMINI_CHECK_MODEL || 'gemini-2.5-flash';
  return async (cand) => {
    const url = cand.conferir || cand.imageUrl;
    if (!url) return false;
    try {
      const img = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!img.ok) return false;
      const tipo = (img.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
      const pergunta =
        `Você escolhe imagens para um documentário histórico narrado para dormir: "${tema}".\n` +
        `Neste momento o narrador diz: "${String(trecho || '').slice(0, 400)}"\n` +
        `A imagem foi buscada por: "${busca}".\n\n` +
        // Regra do canal: mostrar o próprio lugar da história (vídeo de outro lugar reconhecível não serve)
        (lugar ? `O lugar desta cena é: ${lugar}. Se a imagem mostra claramente OUTRO lugar reconhecível (outra cidade, monumento ou país famoso), responda NAO.\n` : '') +
        'Responda só SIM ou NAO. SIM apenas se a imagem combina com o que está sendo narrado E com a época. ' +
        (atual
          ? 'Esta cena mostra o lugar como ele é HOJE: imagens atuais são permitidas. SIM se a imagem mostra o lugar ou o assunto narrado. ' +
            'NAO se não tem relação com a narração, se tem texto grande, logotipo ou marca d\'água, ou se é gente posando para a câmera.'
          : epoca
          ? `A história se passa em: ${epoca}. Fotografias antigas daquela época (preto e branco ou colorizadas), com carros antigos, bondes, ` +
            'postes, letreiros de lojas e prédios antigos são SIM quando combinam com a narração. ' +
            'Responda NAO se aparecer algo de décadas depois: carro moderno, celular, prédio de vidro, roupa atual, turistas de hoje, ' +
            'foto colorida atual, marca d\'água grande; ou se a imagem não tem relação com a narração. ' +
            'Paisagens, rios, chuva, céu, mapas antigos, ilustrações e reconstituições históricas convincentes também são SIM quando combinam.'
          : 'Responda NAO se aparecer qualquer coisa moderna ou fora de época: carro, estrada asfaltada, poste, luz elétrica, cidade moderna, ' +
            'celular, máquina, roupa moderna, pôster, letreiro, texto, logotipo, comida moderna, móveis modernos, turistas, ' +
            'gente fantasiada em feira ou evento atual, pessoa posando para a câmera; ou se a imagem não tem relação com a narração. ' +
            'Paisagens naturais, neve, mar, fogo, animais, céu, ruínas, objetos antigos, pinturas e gravuras históricas e reconstituições ' +
            'históricas convincentes são SIM quando combinam com a narração.');
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: tipo, data: b64 } }, { text: pergunta }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) return true; // Gemini fora do ar: não trava o vídeo
      const d = await r.json();
      const resp = (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim().toUpperCase();
      return resp.startsWith('SIM');
    } catch {
      return true;
    }
  };
}

/**
 * Acha um vídeo ou foto real para a busca. "foto:" na frente = lugar histórico (Wikimedia primeiro).
 * conferir (opcional): função que diz se o candidato combina com a cena; tenta até 7 candidatos.
 */
export async function buscarMidiaReal(buscaBruta, usados = new Set(), conferir = null) {
  const ehFoto = /^foto:/i.test(buscaBruta);
  const ehVideo = /^v[íi]deo( atual)?:/i.test(buscaBruta);
  const busca = buscaBruta.replace(/^(foto|v[íi]deo( atual)?):\s*/i, '').trim();
  const curta = busca.split(/\s+/).slice(0, 2).join(' ');
  // "vídeo:": filme de verdade primeiro (Wikimedia, Pixabay, Pexels); se nada combinar, foto antiga do lugar
  // Regra do canal: se existe vídeo real que combina com a cena, ele vem antes de qualquer imagem parada.
  // Com a conferência da IA ligada, toda cena (até "foto:") tenta primeiro os vídeos, com até 4 conferências só para eles.
  if (!ehVideo && conferir) {
    const v = await tentarVideos(busca, usados, conferir, 4);
    if (v) return v;
  }
  const rodadas = ehVideo ? [commonsVideo, pixabayVideo, pexelsVideo, (q, u) => commonsFoto(q, u, 800), pexelsFoto].map((fn) => [fn, busca]) : [
    // foto: de lugar histórico aceita foto antiga digitalizada (a partir de 800 px de largura)
    ...(ehFoto ? [(q, u) => commonsFoto(q, u, 800), pexelsFoto] : [pexelsVideo, pexelsFoto, commonsFoto]).map((fn) => [fn, busca]),
    ...(curta !== busca ? [[pexelsVideo, curta], [pexelsFoto, curta]] : []),
  ];
  if (ehVideo && curta !== busca) rodadas.push([pixabayVideo, curta], [pexelsVideo, curta]);
  let conferidos = 0;
  for (const [fn, q] of rodadas) {
    let lista = [];
    try {
      lista = await fn(q, usados);
    } catch (e) {
      if (e.message === LIMITE_PEXELS) throw e;
      continue; // tenta a próxima fonte
    }
    for (const c of lista) {
      if (usados.has(c.id)) continue;
      if (!conferir) return c;
      if (conferidos >= 7) return null;
      conferidos++;
      if (await conferir(c)) return c;
    }
  }
  return null;
}

/**
 * Procura só vídeos reais (Wikimedia, Pixabay, Pexels) e devolve o primeiro que a IA aprovar, ou null.
 * maximo = quantos candidatos a IA confere no máximo (cada conferência custa um pouquinho de tempo).
 */
export async function tentarVideos(buscaBruta, usados, conferir, maximo = 4) {
  if (!conferir) return null;
  const busca = String(buscaBruta || '').replace(/^[^:]{1,20}:\s*/, '').trim();
  // Prompt longo de ilustração: os vídeos se acham melhor pelas primeiras palavras
  const curta = busca.split(/[,.]/)[0].split(/\s+/).slice(0, 6).join(' ');
  let conferidos = 0;
  for (const fn of [commonsVideo, pixabayVideo, pexelsVideo]) {
    let lista = [];
    try {
      lista = await fn(curta, usados);
    } catch (e) {
      if (e.message === LIMITE_PEXELS) throw e;
      continue;
    }
    for (const c of lista) {
      if (usados.has(c.id)) continue;
      if (conferidos >= maximo) return null;
      conferidos++;
      if (await conferir(c)) return c;
    }
  }
  return null;
}

/** Pintura de uma cena (quando nenhuma imagem real combina), no estilo das capas do canal. */
async function pinturaDaCena({ tema, trecho, busca, epoca = '' }) {
  if (!process.env.FLUX_API_KEY) return null;
  const prompt =
    (epoca
      ? `Realistic historical documentary illustration set in ${epoca}, looks like a high quality colorized vintage photograph of that time, for "${tema}". `
      : `Cinematic historical digital oil painting, documentary illustration for "${tema}". `) +
    `Scene: ${busca}. Narration context: ${String(trecho || '').slice(0, 300)}. ` +
    'Period-accurate clothing, buildings and objects, warm firelight or soft natural light, rich painterly texture, calm atmosphere, highly detailed. ' +
    'No modern objects, no text, no letters, no logo, no watermark, no frame.';
  try {
    const r = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1344, height: 768 }),
    });
    const d = await r.json();
    if (!r.ok) return null;
    for (let i = 0; i < 45; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      const q = await (await fetch(d.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } })).json();
      if (q.status === 'Ready' && q.result?.sample) {
        const { put } = await import('@vercel/blob');
        const img = Buffer.from(await (await fetch(q.result.sample)).arrayBuffer());
        const blob = await put(`doc-cena-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`, img, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
        return { id: `fx${Date.now()}${Math.random().toString(36).slice(2, 6)}`, imageUrl: blob.url, credito: null };
      }
      if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(q.status)) return null;
    }
  } catch {
    /* sem pintura */
  }
  return null;
}

const ehIlustracao = (b) => /^ilustra[cç][aã]o:/i.test(String(b || '').trim());

/** Um passo das imagens: busca até 40 cenas por vez, 5 ao mesmo tempo (o cron continua de onde parou). */
export async function passoMidiaDocumentario(item) {
  const cenas = item.roteiro.cenas || [];
  const feitas = [...(item.arquivosParciais || [])];
  const usados = new Set(feitas.map((a) => a.midiaId).filter(Boolean));
  let capaUrl = item.capaUrl || null;
  if (!capaUrl && item.roteiro.capa && ehCenaDeJogo(item.roteiro.capa)) {
    // Canal de games: a capa é uma arte/screenshot oficial do jogo
    capaUrl = await capaDeJogo(item.roteiro.capa).catch(() => null);
  }
  if (!capaUrl && item.roteiro.capa && !ehCenaDeJogo(item.roteiro.capa)) {
    // Capa: foto de banco profissional primeiro (cores e luz mais fortes), Wikimedia se não achar
    const busca = item.roteiro.capa.replace(/^foto:\s*/i, '');
    for (const fn of [pexelsFoto, commonsFoto]) {
      try {
        const m = (await fn(busca, new Set()))[0];
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
  const contexto = (c) => {
    const b = String(c.busca || c.descricao || '');
    return {
      tema: item.roteiro.titulo || item.tema || '',
      trecho: textoLimpo(c.textoNarrado),
      busca: b.replace(/^(foto|ilustra[cç][aã]o|v[íi]deo( atual)?):\s*/i, ''),
      // "vídeo atual:" mostra o lugar como é hoje: a conferência não cobra a época
      epoca: /^v[íi]deo atual:/i.test(b) ? '' : item.roteiro.epoca || '',
      atual: /^v[íi]deo atual:/i.test(b),
      // "vídeo atual:" é o próprio lugar (ex.: Mercado Público): a IA recusa vídeo de outro lugar reconhecível
      lugar: /^v[íi]deo atual:/i.test(b) && c.local?.titulo && !/\d/.test(c.local.titulo) ? c.local.titulo : '',
    };
  };
  // 5 buscas ao mesmo tempo, até 40 cenas por rodada (antes era 1 por vez e 10 por rodada)
  const PARALELO = 5;
  const montar = (c, m) => ({
    cena: c.busca || c.descricao,
    // Imagem oficial do jogo é sempre a certa: não passa pela conferência da IA
    conferida: !!process.env.GEMINI_API_KEY || ehCenaDeJogo(c.busca || c.descricao),
    ...(c.local ? { local: c.local } : {}),
    // Movimento de graça por cima da foto/ilustração (chuva, névoa, luz de vela...), escolhido pelo texto da cena
    ...(item.roteiro.epoca ? { movimento: String(c.busca || '').replace(/^[^:]*:\s*/, '').slice(0, 200) } : {}),
    start: c.start ?? null,
    length: c.length ?? null,
    ...(m
      ? {
          midiaId: m.id,
          imageUrl: m.imageUrl || null,
          ...(m.videoUrl ? { videoUrl: m.videoUrl, videoLoop: true, duracao: m.duracao || null } : {}),
          ...(m.credito ? { credito: m.credito } : {}),
          ...(m.jogo ? { jogo: m.jogo } : {}),
        }
      : { erro: ehCenaDeJogo(c.busca || c.descricao) ? `Não achei imagens oficiais de "${nomeDoJogo(c.busca || c.descricao)}" (IGDB/Steam).` : 'Nenhuma imagem real encontrada para esta cena.' }),
  });
  let limitado = false;
  while (!limitado && feitas.length < cenas.length && Date.now() - comeco < 95e3 && feitas.length - (item.arquivosParciais || []).length < 40) {
    const lote = cenas.slice(feitas.length, feitas.length + PARALELO);
    const achados = await Promise.all(
      lote.map(async (c) => {
        const ctx = contexto(c);
        try {
          // "@ jogo: Nome" (canal de games): imagem/trailer oficial do jogo, sem conferência nem pintura
          if (ehCenaDeJogo(c.busca || c.descricao)) return { m: await midiaDeJogo(c.busca || c.descricao, usados) };
          // "@ ilustração: ..." no episódio: a cena é ilustrada pela IA, sem procurar foto
          // (antes, se houver vídeo real que combine com a cena, ele ganha da ilustração)
          if (ehIlustracao(c.busca || c.descricao)) return { m: (await tentarVideos(ctx.busca, usados, conferidorDeCena(ctx), 3)) || (await pinturaDaCena(ctx)) };
          const m = await buscarMidiaReal(c.busca || c.descricao, usados, conferidorDeCena(ctx));
          // Nenhuma imagem real combina com a fala: pinta a cena (melhor do que mostrar algo fora de contexto)
          return { m: m || (conferidorDeCena(ctx) ? await pinturaDaCena(ctx) : null) };
        } catch (e) {
          return { e };
        }
      })
    );
    for (let k = 0; k < lote.length; k++) {
      let { m, e } = achados[k];
      if (e?.message === LIMITE_PEXELS) {
        limitado = true; // Pexels pediu uma pausa: guarda o que já tem e continua na próxima rodada
        break;
      }
      // Duas buscas do mesmo lote pegaram a mesma mídia: busca de novo, agora sabendo o que já foi usado
      if (m && usados.has(m.id)) {
        const c = lote[k];
        const ctx = contexto(c);
        // Ilustração que pegou o mesmo vídeo de outra cena do lote: vira ilustração mesmo
        m = ehCenaDeJogo(c.busca || c.descricao)
          ? await midiaDeJogo(c.busca || c.descricao, usados).catch(() => null)
          : ehIlustracao(c.busca || c.descricao)
          ? await pinturaDaCena(ctx)
          : await buscarMidiaReal(c.busca || c.descricao, usados, conferidorDeCena(ctx)).catch(() => null);
      }
      if (m) usados.add(m.id);
      feitas.push(montar(lote[k], m));
    }
  }
  if (feitas.length < cenas.length) return { arquivosParciais: feitas, ...(capaUrl ? { capaUrl } : {}) };

  // Música de fundo (uma rodada só para ela: o Lyria demora um pouco). null = tentou e não deu, segue sem música
  if (item.roteiro.musica && item.musicaUrl === undefined) {
    return { arquivosParciais: feitas, musicaUrl: await musicaDeFundo(item.roteiro.musica, item.games ? 'games' : 'documentario'), ...(capaUrl ? { capaUrl } : {}) };
  }

  // Cena da cauda (lareira): cobre os 10 min de som ambiente depois da narração
  if (item.cauda && !feitas.some((a) => a.cauda)) {
    let m = null;
    try {
      m = await buscarMidiaReal(CAUDA_BUSCA, usados);
    } catch (e) {
      if (e.message === LIMITE_PEXELS) return { arquivosParciais: feitas, ...(capaUrl ? { capaUrl } : {}) };
    }
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
    midiaConferida: feitas.every((a) => a.conferida || a.cauda),
    status: 'imagens_ok',
  };
  if (item.games) {
    // Games: crédito do material oficial de divulgação (e das fotos do Pexels/Wikimedia, se alguma cena usou)
    const extra = [creditoGames(feitas), ...creditos].filter(Boolean).join('\n');
    if (extra) atualizacao['roteiro.descricao'] = `${item.roteiro.descricao}\n\n${extra}`.slice(0, 4900);
  } else if (creditos.length) {
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
    'The main character is LARGE and CLOSE on the RIGHT side, head and shoulders filling the right 45% of the image, strong expressive face ' +
    'brightly lit by warm golden firelight or sunset light, glowing rim light on hair and shoulders. ' +
    'The LEFT side is a softer, less detailed background of the same scene (space for a title), not black. ' +
    'Vivid rich colors, bright luminous atmosphere, glowing amber and gold highlights against deep blue or teal shadows, high contrast, ' +
    'rich painterly brush texture, highly detailed, masterpiece, eye-catching YouTube thumbnail art, not dark, not muddy. ' +
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
