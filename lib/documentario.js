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

import { ehCenaDeJogo, nomeDoJogo, midiaDeJogo, midiasDoJogo, capaDeJogo, arteDoJogo, creditoGames, vozDosGames, ehImagemDireta, midiaImagemDireta, conferidorGames } from './games';

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
    ...(Array.isArray(ep.acervo) && ep.acervo.length ? { acervo: ep.acervo.map(String).slice(0, 4) } : {}), // Brasil: artigos do caso na Wikipédia
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

/**
 * Cena comprida demais para UMA imagem: divide nas frases, pelo tempo das palavras da fala (ElevenLabs).
 * Assim a ilustração muda quando a frase muda e o que aparece na tela é o que está sendo dito naquele segundo.
 * Frase muito comprida também é cortada na vírgula. Pedaço curto demais (< min s) se junta ao vizinho.
 */
export function dividirPorFrases(cenas, palavras, { max = 7, min = 2.2 } = {}) {
  const ps = (palavras || []).filter((p) => p && p.texto && p.start != null && p.end != null);
  if (!ps.length) return cenas;
  const fecha = (t) => /[.!?;:…]["”'’)]*$/.test(t);
  const virgula = (t) => /[,—–]["”'’)]*$/.test(t);
  const saida = [];
  for (const c of cenas) {
    if (typeof c.start !== 'number' || typeof c.length !== 'number' || c.length <= max) {
      saida.push(c);
      continue;
    }
    const fim = c.start + c.length;
    const dela = ps.filter((p) => p.start >= c.start - 0.05 && p.start < fim - 0.05);
    // frases
    let frases = [];
    let atual = [];
    for (const p of dela) {
      atual.push(p);
      if (fecha(p.texto)) {
        frases.push(atual);
        atual = [];
      }
    }
    if (atual.length) frases.push(atual);
    // frase longa: corta também na vírgula
    frases = frases.flatMap((f) => {
      if (f[f.length - 1].end - f[0].start <= max * 1.3) return [f];
      const out = [];
      let a = [];
      for (const p of f) {
        a.push(p);
        if (virgula(p.texto) && a[a.length - 1].end - a[0].start >= min) {
          out.push(a);
          a = [];
        }
      }
      if (a.length) out.push(a);
      return out;
    });
    // junta frases enquanto couber em "max" segundos
    const grupos = [];
    for (const f of frases) {
      const g = grupos[grupos.length - 1];
      if (g && f[f.length - 1].end - g[0].start <= max) g.push(...f);
      else grupos.push([...f]);
    }
    // último pedaço curtinho vai junto do anterior
    while (grupos.length > 1) {
      const u = grupos[grupos.length - 1];
      const pen = grupos[grupos.length - 2];
      if (u[u.length - 1].end - u[0].start >= min || u[u.length - 1].end - pen[0].start > max * 1.3) break;
      grupos[grupos.length - 2].push(...grupos.pop());
    }
    if (grupos.length < 2) {
      saida.push(c);
      continue;
    }
    const inicios = grupos.map((g, k) => (k === 0 ? c.start : Math.max(c.start, g[0].start - 0.3)));
    grupos.forEach((g, k) => {
      const ini = inicios[k];
      const ate = k < grupos.length - 1 ? inicios[k + 1] : fim;
      const { local, ...resto } = c;
      saida.push({
        ...(k === 0 ? c : resto),
        textoNarrado: g.map((p) => p.texto).join(' '),
        start: Number(ini.toFixed(2)),
        length: Number(Math.max(0.5, ate - ini).toFixed(2)),
      });
    });
  }
  return saida;
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
/** Vídeos do canal de games (Shorts e longos) levam legenda na tela (estilo karaokê dos outros canais); documentário para dormir não. */
export const comLegenda = (item) => !!item?.games || !!item?.politica; // política também leva legenda

/**
 * Narrador do Brasil Inacreditável: voz masculina de brasileiro nativo, de narração/documentário, escolhida uma vez na
 * biblioteca pública da ElevenLabs (a mais usada por quem faz histórias), adicionada à conta e guardada no banco.
 * A voz padrão da conta (estrangeira falando português) soa robótica; esta fala como um narrador de canal brasileiro.
 */
export const vozDoBrasil = () =>
  vozNarradorBR({ doc: 'brasil_inacreditavel', nome: 'Brasil Inacreditável', buscas: ['narrador', 'narrator', 'storytelling', 'documentary', ''], estilo: /narrat|story|document|mystery|mist[eé]r|suspense|dramatic|cinematic|deep|grave|locutor|narrador/ });

/** Canal de política: voz de jornalista/apresentador brasileiro nativo, clara e confiável (no lugar da voz padrão robótica). */
export const vozDaPolitica = () =>
  vozNarradorBR({ doc: 'politica', nome: 'Política', buscas: ['jornalista', 'news', 'locutor', 'narrador', ''], estilo: /news|journal|jornal|anchor|broadcast|reporter|rep[oó]rter|locutor|apresentador|informative|narrat|narrador/ });

const _motivoVoz = {};
async function vozNarradorBR({ doc, nome: nomeCanal, buscas, estilo }) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  let ref = null;
  try {
    const { getDb } = await import('./firebase-admin');
    ref = getDb().collection('youvideo_config').doc(doc);
    const salvo = (await ref.get()).data();
    if (salvo?.vozId) return salvo.vozId;
  } catch {
    /* sem banco: escolhe de novo */
  }
  const h = { 'xi-api-key': key };
  // Já foi adicionada à conta antes (e só não ficou salva no banco)? Usa a mesma
  try {
    const minhas = await fetch('https://api.elevenlabs.io/v1/voices', { headers: h }).then((r) => (r.ok ? r.json() : null));
    const ja = (minhas?.voices || []).find((v) => String(v.name || '').startsWith(`${nomeCanal} — `));
    if (ja?.voice_id) {
      if (ref) await ref.set({ vozId: ja.voice_id, vozNome: ja.name, erro: null }, { merge: true }).catch(() => {});
      return ja.voice_id;
    }
  } catch {
    /* segue para escolher */
  }
  let motivo = 'nenhuma voz brasileira boa na biblioteca';
  const texto = (v) => [v.descriptive, v.description, v.use_case, v.name, v.accent, ...Object.values(v.labels || {})].join(' ').toLowerCase();
  const nota = (v) => {
    const t = texto(v);
    let n = 0;
    if (/brazil|brasil|pt-br|paulist|carioca/.test(t) || v.locale === 'pt-BR') n += 5;
    if (/portugal|european portuguese|lisbo/.test(t) || v.locale === 'pt-PT') n -= 8;
    if (estilo.test(t)) n += 4;
    if (/natural|conversational|warm|expressive/.test(t)) n += 1;
    if (/sleep|meditat|whisper|asmr|calm and slow|child|kid|cartoon|robot/.test(t)) n -= 6;
    return n;
  };
  let escolhida = null;
  try {
    for (const busca of buscas) {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/shared-voices?page_size=50&language=pt&gender=male&sort=cloned_by_count${busca ? `&search=${encodeURIComponent(busca)}` : ''}`,
        { headers: h }
      );
      if (!r.ok) break;
      const lista = ((await r.json()).voices || []).filter((v) => v.gender !== 'female' && nota(v) >= 7);
      lista.sort((a, b) => nota(b) - nota(a) || (b.cloned_by_count || 0) - (a.cloned_by_count || 0));
      const v = lista[0];
      if (v?.public_owner_id && v?.voice_id) {
        const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, {
          method: 'POST',
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: `${nomeCanal} — ${v.name}`.slice(0, 60) }),
        });
        if (!add.ok) {
          const corpo = (await add.text()).slice(0, 160);
          motivo =
            add.status === 401 || /missing the permission/i.test(corpo)
              ? 'a chave da ElevenLabs (ELEVENLABS_API_KEY) não tem permissão para adicionar vozes: em elevenlabs.io → Developers → API Keys, edite a chave e ligue "Voices: Write" (ou crie uma chave com acesso total) e troque na Vercel'
              : /limit|maximum|quota/i.test(corpo)
                ? `a conta da ElevenLabs chegou ao limite de vozes (${add.status}): apague alguma voz que não usa`
                : `a ElevenLabs não deixou adicionar a voz (${add.status}: ${corpo.slice(0, 120)})`;
        }
        if (add.ok) {
          escolhida = (await add.json()).voice_id || v.voice_id;
          console.log(`[${doc}] voz escolhida: ${v.name} (${v.accent || v.locale || 'pt'}, usada por ${v.cloned_by_count || 0})`);
          break;
        }
      }
    }
  } catch {
    /* fica com a voz padrão */
  }
  if (escolhida && ref) await ref.set({ vozId: escolhida, erro: null }, { merge: true }).catch(() => {});
  if (!escolhida) {
    console.log(`[${doc}] voz nova NÃO entrou: ${motivo}`);
    if (ref) await ref.set({ erro: motivo, erroEm: new Date().toISOString() }, { merge: true }).catch(() => {});
    _motivoVoz[doc] = motivo;
  }
  return escolhida;
}

export async function passoVozDocumentario(item) {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY não configurada na Vercel.');
  const { put } = await import('@vercel/blob');
  // Games: voz própria do canal (jovem e animada), nunca a voz calma dos documentários
  const vozId =
    item.vozId ||
    item.roteiro?.voz ||
    (item.games ? await vozDosGames().catch(() => null) : null) ||
    (item.brasil ? process.env.BRASIL_VOICE_ID || (await vozDoBrasil().catch(() => null)) : null) || // Brasil Inacreditável: narrador brasileiro nativo
    (item.politica ? process.env.POLITICA_VOICE_ID || (await vozDaPolitica().catch(() => null)) : null) || // Política: jornalista brasileiro nativo
    (item.games ? process.env.ELEVENLABS_VOICE_ID : process.env.DOCUMENTARIO_VOICE_ID || process.env.ELEVENLABS_VOICE_ID) ||
    '21m00Tcm4TlvDq8ikWAM';
  // Qual narrador foi usado (a conferência final mostra; se caiu na voz padrão, diz o porquê)
  const vozPadrao = vozId === (process.env.DOCUMENTARIO_VOICE_ID || process.env.ELEVENLABS_VOICE_ID) || vozId === '21m00Tcm4TlvDq8ikWAM';
  const vozInfo = { vozId, vozNarrador: (item.politica || item.brasil) && vozPadrao ? 'padrao' : 'canal', ...((item.politica || item.brasil) && vozPadrao ? { vozMotivo: _motivoVoz[item.politica ? 'politica' : 'brasil_inacreditavel'] || 'a voz do canal não foi encontrada' } : {}) };
  const pedacos = pedacosDaNarracao(item.roteiro.narracao);
  if (!pedacos.length) throw new Error('O roteiro deste vídeo está vazio (sem texto para narrar). Descarte e peça de novo.');
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
            : item.brasil
            // Brasil Inacreditável: narrador de mistério, mais variação de entonação (menos "robô") e ritmo natural
            ? { stability: 0.38, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.0 }
            : item.roteiro.ritmo === 'documentario'
            // política um pouco mais devagar (a pessoa precisa entender número e nome)
            ? item.politica
              // política: tom de jornal, natural e claro (número e nome bem falados), sem cara de robô
              ? { stability: 0.42, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 0.93 } // sem correr: dá tempo de entender (pedido do dono)
              : { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.96 }
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
    feitos.push({
      url: blob.url,
      length: Number((fimAudio + 0.6).toFixed(2)),
      inicios: palavras.map((p) => Number(p.start.toFixed(2))),
      // Canal de games: guarda as palavras inteiras para a legenda na tela (~1.300 palavras num vídeo longo cabem no banco)
      ...(comLegenda(item) ? { palavras: palavras.map((p) => ({ texto: p.texto, start: Number(p.start.toFixed(2)), end: Number(p.end.toFixed(2)) })) } : {}),
    });
  }

  if (feitos.length < pedacos.length) {
    return { narracaoParcial: { segmentos: feitos, total: pedacos.length } };
  }

  // Tudo pronto: junta os pedaços numa linha do tempo só
  const audioSegments = [];
  const palavras = []; // { start } de cada palavra, na linha do tempo inteira
  const legenda = []; // { texto, start, end }: só nos Shorts do canal de games
  // A fala começa 0,4 s depois do início: o celular/YouTube "engole" o primeiro instante do áudio e a 1ª letra sumia
  // ("Delegados" virava "elegados"). Cenas e legenda andam junto (tudo usa o mesmo cursor).
  let cursor = 0.4;
  for (const s of feitos) {
    audioSegments.push({ url: s.url, start: Number(cursor.toFixed(2)), length: s.length });
    for (const ini of s.inicios || (s.palavras || []).map((p) => p.start)) palavras.push({ start: ini + cursor });
    for (const p of s.palavras || []) legenda.push({ texto: p.texto, start: Number((p.start + cursor).toFixed(2)), end: Number((p.end + cursor).toFixed(2)) });
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
  let cenas = item.roteiro.cenas.map((c, i) => ({ ...c, ...tempos[i] }));
  // Short de games: nenhuma cena passa de ~3 s (imagem parada por muito tempo faz a pessoa rolar a tela).
  // A cena longa vira várias, cada uma com outra mídia do mesmo jogo; foto da notícia repetida vira vídeo real do assunto.
  if (item.games && item.formato === 'short') {
    const jp = await jogoCerto(item, cenas);
    const curtas = [];
    for (const c of cenas) {
      const partes = c.length > 3.6 ? Math.ceil(c.length / 3) : 1;
      const fatia = c.length / partes;
      for (let k = 0; k < partes; k++) {
        // Desafio "adivinhe o jogo": a imagem fica a mesma (trocar pelo jogo entregaria a resposta)
        const busca = k > 0 && !item.desafio && /^imagem:/i.test(c.busca || '') ? (jp ? `jogo: ${jp}` : 'vídeo atual: gamer playing video game close up') : c.busca;
        curtas.push({
          ...c,
          busca,
          descricao: busca,
          ...(k > 0 ? { local: undefined } : {}),
          start: Number((c.start + k * fatia).toFixed(2)),
          length: Number(fatia.toFixed(2)),
        });
      }
    }
    cenas = curtas.map((c) => (c.local === undefined ? (({ local, ...r }) => r)(c) : c));
  }

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
    narracao: { audioUrl: audioSegments[0].url, audioSegments, palavras: comLegenda(item) ? legenda : [], ...vozInfo, ...(item.brasil && vozInfo.vozNarrador !== 'padrao' ? { vozBrasil: 2 } : {}), ...(item.politica && vozInfo.vozNarrador !== 'padrao' ? { vozPolitica: 2 } : {}) },
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
export function conferidorDeCena({ tema, trecho, busca, epoca = '', atual = false, lugar = '', brasil = false }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (brasil) return conferidorBrasil({ tema, trecho, busca, epoca, key });
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
      if (!r.ok) return false; // Gemini fora do ar: recusa (entra a ilustração da cena, que sempre mostra o que é narrado)
      const d = await r.json();
      const resp = (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim().toUpperCase();
      return resp.startsWith('SIM');
    } catch {
      return false;
    }
  };
}

/**
 * Brasil Inacreditável (histórias reais, muitas recentes): a prioridade é mostrar o que ACONTECEU de verdade.
 * Aceita foto de jornal, foto de arquivo, foto atual do lugar, documento, mapa e vídeo real do caso; recusa outro
 * lugar reconhecível, coisa sem relação, print de site, marca d'água grande e cena chocante.
 */
function conferidorBrasil({ tema, trecho, busca, epoca, key }) {
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
        `Você escolhe imagens para um documentário de HISTÓRIAS REAIS DO BRASIL no YouTube: "${tema}".\n` +
        (epoca ? `Lugar e época da história: ${epoca}.\n` : '') +
        `Neste momento o narrador diz: "${String(trecho || '').slice(0, 400)}"\n` +
        `A imagem foi buscada por: "${busca}".\n\n` +
        'Responda só SIM ou NAO. SIM quando a imagem mostra o caso de verdade ou combina com a frase: foto real do acontecimento, ' +
        'foto de jornal ou de arquivo, o lugar (antes ou hoje), as pessoas, o objeto, o veículo, o mapa ou o documento citado, ' +
        'ou uma paisagem/cena brasileira que combina com o que é dito. ' +
        'NAO se mostra claramente outro país ou outro lugar famoso, se não tem relação com a frase, se é print de site ou de rede social, ' +
        'se tem texto grande, logotipo ou marca d\'água, ou se mostra corpo, sangue ou ferimento.';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: tipo, data: b64 } }, { text: pergunta }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) {
        // sem isto, Gemini sem crédito/limite virava "todas as fotos recusadas" sem ninguém saber
        if (Date.now() - (globalThis._avisoGeminiPol || 0) > 10 * 60e3) {
          globalThis._avisoGeminiPol = Date.now();
          console.warn(`[politica-conferidor] Gemini recusou a conferência (${r.status}): ${(await r.text().catch(() => '')).slice(0, 160)}`);
        }
        return false;
      }
      const d = await r.json();
      return (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim().toUpperCase().startsWith('SIM');
    } catch {
      return false;
    }
  };
}

/**
 * Acervo real do caso (Brasil Inacreditável): todas as fotos e vídeos livres (Wikimedia Commons) que estão nos
 * artigos da Wikipédia sobre a história — a foto do avião, o túnel, a cidade destruída, os jornais da época.
 * É o "flash do que aconteceu": entra antes de qualquer banco de imagens ou ilustração.
 */
const acervoCache = new Map();
const NAO_E_FOTO = /\.svg$|logo|brasão|brasao|coat of arms|flag of|bandeira d|mapa de localiza|locator|location map|icon|ícone|commons-logo|wiki|disambig|signature|assinatura|question_book|edit-clear|padlock|symbol/i;
/** Termos para achar os artigos do caso: os que a pesquisa indicou, o título da pauta e o título do vídeo. */
export function termosDoAcervo(item) {
  const r = item.roteiro || {};
  return [...(r.acervo || []), item.tema, r.titulo].map((t) => String(t || '').replace(/[:|].*$/, '').trim()).filter((t) => t.length > 3);
}
export async function acervoDaHistoria(termos = []) {
  const chave = termos.join('|');
  if (acervoCache.has(chave)) return acervoCache.get(chave);
  const tarefa = (async () => {
    const achados = [];
    const vistos = new Set();
    for (const termo of termos.filter(Boolean).slice(0, 4)) {
      for (const lingua of ['pt', 'en']) {
        try {
          const s = await (
            await fetch(`https://${lingua}.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=2&srsearch=${encodeURIComponent(termo)}`, { headers: { 'User-Agent': UA } })
          ).json();
          for (const pag of s.query?.search || []) {
            if (vistos.has(`${lingua}:${pag.title}`)) continue;
            vistos.add(`${lingua}:${pag.title}`);
            const d = await (
              await fetch(
                `https://${lingua}.wikipedia.org/w/api.php?action=query&format=json&generator=images&gimlimit=50&titles=${encodeURIComponent(pag.title)}` +
                  '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600',
                { headers: { 'User-Agent': UA } }
              )
            ).json();
            for (const p of Object.values(d.query?.pages || {})) {
              const info = p.imageinfo?.[0];
              // Só o que está no Commons (licença livre); foto "uso justo" enviada só na Wikipédia fica de fora
              if (!info || p.imagerepository !== 'shared' || NAO_E_FOTO.test(p.title)) continue;
              const video = /^video\//.test(info.mime || '') || /\.(webm|ogv)$/i.test(p.title);
              if (!video && !/^image\/(jpeg|png|webp)/.test(info.mime || '')) continue;
              if (!video && ((info.width || 0) < 640 || (info.width || 0) < (info.height || 0) * 0.8)) continue;
              const meta = info.extmetadata || {};
              const licenca = semHtml(meta.LicenseShortName?.value);
              if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
              const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
              const nome = semHtml(meta.ObjectName?.value || p.title.replace(/^(File|Ficheiro|Arquivo):/, '').replace(/\.[a-z0-9]+$/i, '')).slice(0, 90);
              const id = `ac${semAcento(p.title).replace(/[^a-z0-9]/gi, '').slice(-40)}`;
              if (achados.some((x) => x.id === id)) continue;
              const credito = `${nome} — ${autor} — ${licenca} — Wikimedia Commons`;
              if (video) {
                if (!info.thumburl || (info.size || 0) > 150e6) continue; // vídeo enorme: fica de fora
                achados.push({ id, videoUrl: info.url, imageUrl: info.thumburl, conferir: info.thumburl, credito, acervo: true });
              } else achados.push({ id, imageUrl: info.thumburl || info.url, conferir: info.thumburl || info.url, credito, acervo: true });
            }
          }
        } catch {
          /* tenta o próximo */
        }
      }
      if (achados.length >= 40) break;
    }
    console.log(`[brasil] acervo do caso: ${achados.length} fotos/vídeos reais (${termos.slice(0, 2).join(' / ')})`);
    return achados;
  })();
  acervoCache.set(chave, tarefa);
  return tarefa;
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

/** Reserva do canal de games: vídeo real de gente jogando / console (conferido), nunca pintura. */
async function videoDeGames(usados, ctx) {
  const confere = conferidorGames({ assunto: ctx.tema, trecho: ctx.trecho });
  for (const busca of ['gamer playing video game close up', 'video game controller close up', 'gaming setup rgb']) {
    const m = await buscarBanco(busca, usados, confere).catch(soLimite);
    if (m) return m;
  }
  return buscarBanco('gamer playing video game', usados, null).catch(soLimite);
}


// ───────────────────────── Canal de política: imagens que combinam com a fala ─────────────────────────

/**
 * Conferência RÍGIDA do canal de política (Gemini): a imagem precisa combinar com a frase, no contexto do BRASIL.
 * Recusa bandeira/político/parlamento/urna de outro país, gente de outro lugar reconhecível e cena sem relação
 * (oficina, cozinha, escritório qualquer). Na dúvida (ou se o Gemini falhar) é NÃO: aí entra Brasília, que sempre combina.
 */
export function conferidorPolitica({ tema = '', trecho = '' } = {}) {
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
        `Você escolhe imagens para um vídeo de NOTÍCIA DE POLÍTICA DO BRASIL: "${tema}".\n` +
        'O assunto da notícia pode ser outro além de política (big techs, combustível, comida, saúde): imagem real desse assunto também vale SIM (sede de empresa, celular com aplicativo, posto, mercado).\n' +
        `Neste momento o narrador diz: "${String(trecho || '').slice(0, 400)}"\n\n` +
        'Responda só SIM ou NAO.\n' +
        'SIM só se a imagem mostra AQUILO DE QUE A FRASE FALA, no contexto brasileiro: a pessoa, o lugar, o prédio, o objeto, o órgão ou a ação citados (ex.: frase do tríplex -> o prédio/apartamento; frase de leilão -> leilão; frase do STF -> o STF; frase de votação -> plenário votando; frase de dinheiro -> dinheiro). ' +
        'Símbolo GENÉRICO de Brasília (Congresso, Planalto, Esplanada, bandeira) só vale SIM se a frase fala do governo, do Congresso ou da política em geral — não para ilustrar um fato específico que aconteceu em outro lugar. Imagem "aleatória", que só combina de longe, é NAO.\n' +
        'NAO se: aparece bandeira, político, presidente, parlamento, prédio ou urna de OUTRO país (Estados Unidos, Europa...); ' +
        'é gravação antiga de outro lugar; mostra uma atividade sem relação com a frase (oficina, cozinha, loja, escritório qualquer, esporte); ' +
        'é print/captura de tela (site, resultado de busca, YouTube, rede social, aplicativo, planilha); ' +
        'é animal, planta, comida ou desenho científico (ex.: "lula" o molusco no lugar do presidente Lula); ' +
        'tem texto grande, logotipo SOZINHO (fachada de empresa com o nome é permitida) ou marca d\'água; ou você não tem certeza.';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: tipo, data: b64 } }, { text: pergunta }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      return (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim().toUpperCase().startsWith('SIM');
    } catch {
      return false;
    }
  };
}

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * "@ foto de: Nome do político": foto REAL e de uso livre da pessoa no Wikimedia Commons
 * (lá ficam as fotos da Agência Brasil, Senado e Câmara, CC BY). Só aceita arquivo com o nome e o sobrenome no título.
 */
// Apelidos que, sozinhos, levam à página errada ("Lula" na Wikipédia é o MOLUSCO): sempre o nome completo
const NOMES_COMPLETOS = {
  lula: 'Luiz Inácio Lula da Silva', 'presidente lula': 'Luiz Inácio Lula da Silva', bolsonaro: 'Jair Bolsonaro', 'jair bolsonaro': 'Jair Bolsonaro',
  michelle: 'Michelle Bolsonaro', flavio: 'Flávio Bolsonaro', 'flavio bolsonaro': 'Flávio Bolsonaro', eduardo: 'Eduardo Bolsonaro', carlos: 'Carlos Bolsonaro',
  moraes: 'Alexandre de Moraes', 'alexandre de moraes': 'Alexandre de Moraes', janja: 'Rosângela Lula da Silva', 'janja lula': 'Rosângela Lula da Silva',
  haddad: 'Fernando Haddad', tarcisio: 'Tarcísio de Freitas', alckmin: 'Geraldo Alckmin', boulos: 'Guilherme Boulos', nikolas: 'Nikolas Ferreira',
  janones: 'André Janones', marcal: 'Pablo Marçal', trump: 'Donald Trump', milei: 'Javier Milei', dino: 'Flávio Dino', gilmar: 'Gilmar Mendes',
  'hugo motta': 'Hugo Motta', alcolumbre: 'Davi Alcolumbre', lira: 'Arthur Lira', zanin: 'Cristiano Zanin', barroso: 'Luís Roberto Barroso', fachin: 'Edson Fachin',
};
export const nomeCompleto = (nome) => NOMES_COMPLETOS[semAcento(String(nome || '')).trim()] || String(nome || '').trim();
// Página que não é de pessoa/lugar/órgão (animal, planta, desambiguação): a foto não serve
const PAGINA_ERRADA = /molusco|cefal[óo]pode|esp[ée]cie|g[êe]nero de|fam[íi]lia de (animais|plantas|aves|peixes)|animal|peixe|\bave\b|planta|inseto|mam[íi]fero|r[ée]ptil|desambigua|disambiguation|squid|species|genus|mollus/i;

async function fotoDaWikipedia(nome0) {
  const nome = nomeCompleto(nome0);
  for (const lingua of ['pt', 'en']) {
    try {
      const r = await fetch(`https://${lingua}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|description&piprop=name&titles=${encodeURIComponent(nome)}`, { headers: { 'User-Agent': UA } });
      const d = await r.json();
      const pag = Object.values(d.query?.pages || {})[0];
      if (PAGINA_ERRADA.test(String(pag?.description || '')) || PAGINA_ERRADA.test(String(pag?.title || ''))) continue;
      const arquivo = pag?.pageimage;
      if (!arquivo) continue;
      if (PAGINA_ERRADA.test(arquivo)) continue;
      const c = await (
        await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent('File:' + arquivo)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280`, { headers: { 'User-Agent': UA } })
      ).json();
      const p = Object.values(c.query?.pages || {})[0];
      const info = p?.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata || {};
      const licenca = semHtml(meta.LicenseShortName?.value);
      if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
      const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
      return { id: `wp${p.pageid || arquivo}`, imageUrl: info.thumburl || info.url, conferir: info.thumburl || info.url, credito: `${nome} — ${autor} — ${licenca} — Wikimedia Commons` };
    } catch {
      /* tenta a outra língua */
    }
  }
  return null;
}

// Fotos de cada pessoa (Wikipédia + Commons), guardadas durante a rodada
const fotosPessoaCache = new Map();
async function fotosDaPessoa(nome0) {
  const nome = nomeCompleto(nome0);
  const chave = semAcento(nome);
  if (!fotosPessoaCache.has(chave)) {
    fotosPessoaCache.set(
      chave,
      (async () => {
        const [daWiki, doCommons] = await Promise.all([fotoDaWikipedia(nome).catch(() => null), fotoDePessoaCommons(nome, new Set(), true).catch(() => [])]);
        const lista = [daWiki, ...(doCommons || [])].filter(Boolean);
        return lista.filter((f, i) => lista.findIndex((g) => g.id === f.id) === i);
      })()
    );
  }
  return fotosPessoaCache.get(chave);
}

/** Foto da pessoa: a "ordem" (1ª, 2ª, 3ª cena dela no vídeo) escolhe uma foto diferente de cada vez. */
async function fotoDePessoa(nome, usados, ordem = 0) {
  const lista = await fotosDaPessoa(nome);
  if (!lista.length) return null;
  const livre = lista.filter((f) => !usados.has(f.id));
  return (livre.length ? livre : lista)[ordem % (livre.length || lista.length)];
}

/**
 * Vídeo LIVRE da pessoa falando (Wikimedia Commons: Agência Brasil, Planalto, Senado, Câmara... com licença CC/domínio público).
 * Só vídeo de licença livre (sem risco de reivindicação), com nome e sobrenome da pessoa no título do arquivo.
 * Devolve { id, videoUrl, imageUrl, duracao, inicio, credito } ou null.
 */
const videosPessoaCache = new Map();
export async function videoDePessoaCommons(nome0) {
  const nome = nomeCompleto(nome0);
  const chave = semAcento(nome);
  if (videosPessoaCache.has(chave)) return videosPessoaCache.get(chave);
  const trabalho = (async () => {
    const palavras = (t) => semAcento(t).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((p) => p.length > 2 && !['dos', 'das', 'del', 'van'].includes(p));
    const partes = palavras(nome);
    const curto = palavras(nome0);
    if (!partes.length) return null;
    // o arquivo tem que ser DA pessoa: nome e sobrenome completos no título, ou todas as palavras do nome usado na notícia ("Flávio Bolsonaro", "Lula")
    const ehDaPessoa = (titulo) =>
      (partes.length >= 2 && titulo.includes(partes[0]) && titulo.includes(partes[partes.length - 1])) || (curto.length && curto.every((w) => titulo.includes(w)));
    const achados = [];
    for (const termo of [...new Set([nome, String(nome0 || '').trim()])].filter(Boolean)) {
      if (achados.length) break;
      const url =
        'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=25' +
        `&gsrsearch=${encodeURIComponent(`"${termo}" filetype:video`)}&prop=videoinfo&viprop=url|size|derivatives|extmetadata&viurlwidth=640`;
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!r?.ok) continue;
      const d = await r.json().catch(() => ({}));
      const paginas = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      for (const p of paginas) {
        const info = p.videoinfo?.[0];
        if (!info) continue;
        const titulo = semAcento(p.title);
        if (!ehDaPessoa(titulo)) continue;
        if (/loligo|squid|lula comum|cephalopod|octopus|animation|animacao|desenho|cartoon|caricatur|sat[ií]ra|meme/.test(titulo)) continue;
        const dur = Number(info.duration) || 0;
        if (dur < 6 || (info.width || 0) < 480) continue;
        const meta = info.extmetadata || {};
        const licenca = semHtml(meta.LicenseShortName?.value);
        if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
        const derivadas = (info.derivatives || []).filter((v) => /webm|mp4/i.test(v.type || '') && Number(v.height) >= 360);
        const escolhida = derivadas.filter((v) => Number(v.height) <= 720).sort((a, b) => Number(b.height) - Number(a.height))[0] || null;
        const videoUrl = escolhida?.src || ((info.size || 0) < 80e6 ? info.url : null);
        if (!videoUrl) continue;
        const ano = Number(String(meta.DateTimeOriginal?.value || p.title).match(/(19|20)\d{2}/)?.[0]) || 0;
        const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
        const nomeArq = semHtml(meta.ObjectName?.value || p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')).slice(0, 90);
        achados.push({
          id: `wv${p.pageid}`,
          videoUrl,
          imageUrl: info.thumburl || null,
          duracao: dur,
          ano,
          // pula a abertura (vinheta/título): começa a ~25% do vídeo
          inicio: Number(Math.min(dur * 0.25, Math.max(0, dur - 10)).toFixed(1)),
          credito: `${nomeArq} — ${autor} — ${licenca} — Wikimedia Commons`,
        });
      }
    }
    // o mais recente primeiro (a pessoa com a cara de hoje)
    achados.sort((a, b) => (b.ano || 0) - (a.ano || 0));
    return achados[0] || null;
  })();
  videosPessoaCache.set(chave, trabalho);
  return trabalho;
}

async function fotoDePessoaCommons(nome0, usados, todas = false) {
  const nome = nomeCompleto(nome0);
  const partes = semAcento(nome).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((p) => p.length > 2 && !['dos', 'das', 'del', 'van'].includes(p));
  if (!partes.length) return null;
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=20' +
    `&gsrsearch=${encodeURIComponent(`"${nome}" filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
  if (!r?.ok) return null;
  const d = await r.json().catch(() => ({}));
  const paginas = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const achados = [];
  for (const p of paginas) {
    const info = p.imageinfo?.[0];
    if (!info || (info.width || 0) < 600) continue;
    const titulo = semAcento(p.title);
    // Nome e sobrenome no título do arquivo (ex.: "Guilherme Boulos em 2023.jpg")
    if (!titulo.includes(partes[0]) || !titulo.includes(partes[partes.length - 1])) continue;
    if (/logo|assinatura|signature|brasao|coat of arms|mapa|map|grafico|chart|loligo|squid|lula comum|cephalopod|octopus|illustration|ilustracao|drawing/.test(titulo)) continue;
    const meta = info.extmetadata || {};
    const licenca = semHtml(meta.LicenseShortName?.value);
    if (!LICENCA_LIVRE.test(licenca) || /nc|nd/i.test(licenca.replace(/^cc[ -]by[ -]sa/i, ''))) continue;
    const id = `wp${p.pageid}`;
    const autor = semHtml(meta.Artist?.value).slice(0, 80) || 'autor desconhecido';
    achados.push({ id, imageUrl: info.thumburl || info.url, conferir: info.thumburl || info.url, credito: `${nome} — ${autor} — ${licenca} — Wikimedia Commons` });
  }
  if (todas) return achados.slice(0, 8);
  return achados.find((a) => !usados.has(a.id)) || achados[0] || null; // repetir a foto da pessoa é melhor que mostrar outra coisa
}

// Erro de busca vira "nada achado", MENOS o limite da Pexels: esse sobe para a rodada pausar e continuar depois
// (antes ele virava "Nenhuma imagem real foi encontrada" e o vídeo dava erro)
const soLimite = (e) => {
  if (e?.message === LIMITE_PEXELS) throw e;
  return null;
};

/** Jogo mais citado nas cenas ("@ jogo: X"): é o assunto do vídeo de games. */
// Games: notícia de APARELHO (controle, console, headset, PC...). A imagem tem que ser o aparelho, nunca a gameplay de outro jogo.
const HARDWARE = /\b(dualsense|dualshock|controle|joystick|gamepad|headset|steam deck|rog ally|legion go|ps5 pro|playstation portal|placa de v[ií]deo|rtx ?\d{3,4}|novo console|pre[çc]o do (console|ps5|xbox|switch)|switch 2 (custa|pre[çc]o|vende))/i;
// Aparelho citado no título sem o nome do jogo principal ("Um jacaré engoliu um Xbox Series X") também é notícia de aparelho
const APARELHO = /\b(xbox series [xs]|xbox one|playstation 5|playstation 4|ps5|ps4|nintendo switch 2|switch 2|nintendo switch|steam deck|dualsense|meta quest \d?)\b/i;
const semAc = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// O jogo principal aparece no título? (qualquer palavra forte do nome ou a sigla: "Zelda", "GTA")
const tituloCitaJogo = (t, principal = '') => {
  if (!principal) return false;
  const tx = ` ${semAc(t).replace(/[^a-z0-9 ]/g, ' ')} `;
  const pal = semAc(principal).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !['the', 'legend', 'edition', 'remake', 'game', 'games'].includes(w));
  const sigla = semAc(principal).split(/\s+/).filter((w) => w && !['the', 'of', 'a'].includes(w)).slice(0, 3).map((w) => w[0]).join('');
  const inteiro = semAc(principal).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return (inteiro.length >= 3 && tx.replace(/\s+/g, ' ').includes(` ${inteiro} `)) || pal.some((w) => tx.includes(` ${w} `)) || (sigla.length >= 2 && tx.includes(` ${sigla} `));
};
const ehHardware = (t, principal = '') => {
  const x = String(t || '');
  if (HARDWARE.test(x)) return true;
  if (!APARELHO.test(x)) return false;
  // "GTA 6 em 30 FPS no PS5": a notícia é do JOGO (capa = GTA), não do console
  return !tituloCitaJogo(x, principal);
};
const NOME_APARELHO = { 'xbox series x': 'Xbox Series X and Series S', 'xbox series s': 'Xbox Series X and Series S', 'xbox one': 'Xbox One', 'playstation 5': 'PlayStation 5', ps5: 'PlayStation 5', 'playstation 4': 'PlayStation 4', ps4: 'PlayStation 4', 'nintendo switch 2': 'Nintendo Switch 2', 'switch 2': 'Nintendo Switch 2', 'nintendo switch': 'Nintendo Switch', 'steam deck': 'Steam Deck', dualsense: 'DualSense' };
const produtoDoTitulo = (t) => {
  const m = (String(t || '').match(APARELHO) || [])[0] || '';
  return NOME_APARELHO[semAc(m).replace(/\s+/g, ' ')] || m;
};
const ehCenaDeProduto = (b) => /^produto:/i.test(String(b || ''));
function produtoPrincipal(cenas, capa = '') {
  const conta = {};
  for (const b of [capa, ...(cenas || []).map((c) => c.busca || c.descricao)]) {
    if (!ehCenaDeProduto(b)) continue;
    const n = String(b).replace(/^produto:\s*/i, '').split('|')[0].trim();
    if (n) conta[n] = (conta[n] || 0) + 1;
  }
  return Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
/** Foto real do aparelho: a foto principal da Wikipédia dele (pt/en) e, se não tiver, o Wikimedia Commons conferido pela IA. */
async function fotoDoProduto(nome, usados, confere) {
  const q = String(nome || '').replace(/^produto:\s*/i, '').split('|')[0].trim();
  if (!q) return null;
  for (const t of [q, q.split(/\s+/).slice(0, 2).join(' ')]) {
    const w = await fotoDaWikipedia(t).catch(() => null);
    if (w && !usados.has(w.id)) return w;
  }
  let conferidos = 0;
  for (const termo of [q, q.split(/\s+/).slice(0, 2).join(' ')]) {
    const lista = await commonsFoto(termo, usados, 800).catch(() => []);
    for (const cand of lista) {
      if (usados.has(cand.id) || conferidos >= 5) continue;
      conferidos++;
      if (!confere || (await confere(cand))) return cand;
    }
  }
  return null;
}

function jogoPrincipal(cenas) {
  const conta = {};
  for (const c of cenas || []) {
    const b = String(c.busca || c.descricao || '');
    if (/^jogo:/i.test(b)) {
      const n = b.replace(/^jogo:\s*/i, '').split('|')[0].trim();
      if (n) conta[n] = (conta[n] || 0) + 1;
    }
  }
  return Object.entries(conta).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

/**
 * O jogo DO VÍDEO = o jogo do TÍTULO. O roteiro também marca jogos só citados de passagem ("Starfield também foi 30 fps"):
 * esses aparecem SÓ na própria cena, nunca preenchem o resto do vídeo. Se o jogo do título não tem mídia oficial
 * (ex.: GTA 6 fora da Steam/Xbox), devolve '' — melhor a foto da notícia/console do que gameplay de OUTRO jogo.
 */
export async function jogoCerto(item, cenas) {
  const titulo = `${item.roteiro?.titulo || ''} ${item.tema || ''}`;
  const conta = {};
  for (const c of cenas || []) {
    const b = String(c.busca || c.descricao || '');
    if (/^jogo:/i.test(b)) {
      const n = b.replace(/^jogo:\s*/i, '').split('|')[0].trim();
      if (n) conta[n] = (conta[n] || 0) + 1;
    }
  }
  const noTitulo = Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([n]) => n).filter((n) => tituloCitaJogo(titulo, n));
  for (const n of noTitulo) {
    const { videos, fotos } = await midiasDoJogo(n).catch(() => ({ videos: [], fotos: [] }));
    if (videos.length || fotos.length) return n;
  }
  // O título não cita nenhum dos jogos marcados: pergunta qual é o jogo do título (e só vale se tiver mídia oficial)
  const jv = await jogoDoVideo(item).catch(() => '');
  if (jv && (tituloCitaJogo(titulo, jv) || !Object.keys(conta).length)) return jv;
  return '';
}

/**
 * Jogo/franquia do vídeo de games quando o roteiro não marcou "@ jogo:" (ex.: "Goku e Vegeta não são os mais fortes em
 * Dragon Ball" -> DRAGON BALL: Sparking! ZERO). Só vale se o jogo tiver mídia oficial (IGDB/Steam/Xbox).
 * Assim o vídeo mostra o próprio jogo/anime em vez de banco genérico (carro, cidade, controle...).
 */
const _franquia = new Map();
async function jogoDoVideo(item) {
  const chave = String(item.id || item.roteiro?.titulo || item.tema || '');
  if (_franquia.has(chave)) return _franquia.get(chave);
  const p = (async () => {
    const titulo = `${item.roteiro?.titulo || ''} — ${item.tema || ''}`.slice(0, 300);
    let j = null;
    try {
      const { ia } = await import('./gamesNoticias');
      j = await ia(
        'Você ajuda um canal brasileiro de games a achar imagens oficiais. Dado o título de um vídeo, diga qual é o JOGO principal do assunto. ' +
          'Se o assunto é uma franquia (anime, filme, série de jogos), escolha o jogo MAIS RECENTE e famoso dela que está à venda na Steam ou no Xbox, com o nome oficial exato da loja. ' +
          'Se o vídeo é sobre games em geral (sem um jogo/franquia), responda vazio. Responda só JSON: {"jogo":"...","franquia":"..."}',
        titulo,
        { temperatura: 0.1 }
      );
    } catch {
      return '';
    }
    for (const nome of [j?.jogo, j?.franquia].map((x) => String(x || '').trim()).filter(Boolean)) {
      const { videos, fotos } = await midiasDoJogo(nome).catch(() => ({ videos: [], fotos: [] }));
      if (videos.length || fotos.length) {
        console.log(`[games] jogo do vídeo "${titulo.slice(0, 80)}" -> ${nome}`);
        return nome;
      }
    }
    return '';
  })();
  _franquia.set(chave, p);
  return p;
}

/** Busca em bancos de vídeo/foto ATUAIS (Pexels, Pixabay), sem o arquivo antigo do Wikimedia; conferida pela IA. Política e games. */
async function buscarBanco(buscaBruta, usados, confere) {
  const busca = String(buscaBruta || '').replace(/^(foto|v[íi]deo( atual)?):\s*/i, '').trim();
  const curta = busca.split(/\s+/).slice(0, 3).join(' ');
  let conferidos = 0;
  for (const [fn, q] of [[pexelsVideo, busca], [pixabayVideo, busca], [pexelsFoto, busca], ...(curta !== busca ? [[pexelsVideo, curta], [pexelsFoto, curta]] : [])]) {
    let lista = [];
    try {
      lista = await fn(q, usados);
    } catch (e) {
      if (e.message === LIMITE_PEXELS) throw e;
      continue;
    }
    for (const c of lista) {
      if (usados.has(c.id)) continue;
      if (!confere) return c;
      if (conferidos >= 6) return null;
      conferidos++;
      if (await confere(c)) return c;
    }
  }
  return null;
}

/** Reserva do canal de política: vídeo real e genérico (Brasília, bandeira, urna), nunca pintura. */
import { lugarDaNoticia } from './lugares';
export { lugarDaNoticia };

async function videoDePolitica(usados, lugar = null) {
  if (lugar) {
    for (const busca of lugar.buscas) {
      const m = await buscarBanco(busca, usados, null).catch(soLimite);
      if (m) return m;
    }
    for (const q of lugar.fotos) {
      const f = (await commonsFoto(q, new Set(), 800).catch(() => [])).find((x) => !usados.has(x.id));
      if (f) return f;
    }
  }
  for (const busca of ['brasilia national congress building', 'brazilian flag waving', 'brasilia city aerial', 'brasilia esplanada ministerios']) {
    const m = await buscarBanco(busca, usados, null).catch(soLimite);
    if (m) return m;
  }
  // Sem banco de vídeo (limite, chave, tudo já usado): foto real de Brasília do Wikimedia; pode repetir, nunca deixa a cena sem imagem
  const fotos = [];
  for (const q of ['Congresso Nacional do Brasil', 'Palácio do Planalto', 'Esplanada dos Ministérios Brasília', 'Supremo Tribunal Federal Brasília']) {
    fotos.push(...(await commonsFoto(q, new Set(), 800).catch(() => [])));
    const livre = fotos.find((f) => !usados.has(f.id));
    if (livre) return livre;
  }
  return fotos.length ? { ...fotos[0], id: `${fotos[0].id}_r${Math.random().toString(36).slice(2, 6)}` } : null;
}

const ehIlustracao = (b) => /^ilustra[cç][aã]o:/i.test(String(b || '').trim());

/** Um passo das imagens: busca até 40 cenas por vez, 5 ao mesmo tempo (o cron continua de onde parou). */
export async function passoMidiaDocumentario(item) {
  const cenas = item.roteiro.cenas || [];
  // Política: antes de buscar, escolhe a imagem de cada cena PELA FRASE (pessoa citada -> foto dela; fato -> foto real).
  // Vale para qualquer roteiro, até os escritos antes dessa regra. Uma vez por vídeo; recomeça as cenas já buscadas.
  // Games ilustrado (Short sobre um tema, ex.: GTA 6): cada frase ganha uma ilustração que explica; a última, o "se inscreve"
  if (item.games && item.ilustrado && !item.midiasPlanejadas) {
    const { planejarIlustracoes, diagIlustracao } = await import('./politicaNoticias');
    let texto = '';
    if (item.noticia) {
      try {
        const { getDb } = await import('./firebase-admin');
        const { COLECAO_NOTICIAS } = await import('./gamesNoticias');
        const n = (await getDb().collection(COLECAO_NOTICIAS).doc(String(item.noticia)).get()).data() || {};
        texto = [n.titulo, n.texto].filter(Boolean).join('\n');
      } catch {}
    }
    Object.assign(diagIlustracao, { erros: [], sugeridas: 0, aceitas: 0, exemploRecusado: '' });
    // Os pedaços de ~3 s da mesma frase voltam a ser uma cena só e a cena é dividida pelas FRASES da fala:
    // antes cada pedaço ganhava uma ilustração diferente para a mesma frase e o desenho ficava adiantado/atrasado.
    const juntas = [];
    for (const c of cenas) {
      const u = juntas[juntas.length - 1];
      if (u && u.textoNarrado === c.textoNarrado && Math.abs(u.start + u.length - c.start) < 0.15) {
        u.length = Number((u.length + c.length).toFixed(2));
        u._buscas.push(c.busca);
      } else juntas.push({ ...c, _buscas: [c.busca] });
    }
    const frases = dividirPorFrases(juntas, item.narracao?.palavras, { max: 6 });
    const ilus = await planejarIlustracoes(frases.map((c) => ({ texto: textoLimpo(c.textoNarrado) })), item.roteiro.titulo || item.tema || '', texto, { canal: 'games' }).catch(() => null);
    if (ilus) {
      const ult = ilus.length - 1;
      if (ult >= 0) ilus[ult] = { tipo: 'inscreva', etiqueta: 'COMENTE', titulo: 'Se inscreve!', destaque: 'inscreve', texto: String(ilus[ult]?.texto || 'E você, vai jogar?').slice(0, 40) };
    }
    // Cena com ilustração: o desenho fica a frase inteira (até ~9 s; depois disso, imagens do jogo).
    // Cena sem ilustração: imagem do jogo trocando a cada ~3 s, como antes.
    const planejadas = [];
    const usoBusca = new Map();
    const pedacosDeMidia = (c) => {
      const lista = c._buscas.filter(Boolean);
      const partes = c.length > 3.6 ? Math.ceil(c.length / 3) : 1;
      const fatia = c.length / partes;
      for (let k = 0; k < partes; k++) {
        const n = usoBusca.get(c._buscas) || 0;
        usoBusca.set(c._buscas, n + 1);
        const busca = lista.length ? lista[n % lista.length] : c.busca;
        const { _buscas, local, ...resto } = c;
        planejadas.push({ ...resto, ...(k === 0 && local ? { local } : {}), busca, descricao: busca, start: Number((c.start + k * fatia).toFixed(2)), length: Number(fatia.toFixed(2)) });
      }
    };
    frases.forEach((c, i) => {
      const ilu = ilus?.[i];
      if (!ilu || ['foto', 'fala'].includes(ilu.tipo)) return pedacosDeMidia(c);
      const { _buscas, ...resto } = c;
      if (c.length <= 9.5) return planejadas.push({ ...resto, ilustracao: ilu });
      planejadas.push({ ...resto, length: 7, ilustracao: ilu });
      const { local, ...semLocal } = c;
      pedacosDeMidia({ ...semLocal, start: Number((c.start + 7).toFixed(2)), length: Number((c.length - 7).toFixed(2)) });
    });
    const infoIlustracoes = { cenas: cenas.length, sugeridas: diagIlustracao.sugeridas || 0, aceitas: diagIlustracao.aceitas || 0, erros: diagIlustracao.erros || [], exemploRecusado: diagIlustracao.exemploRecusado || '', em: new Date().toISOString() };
    return { 'roteiro.cenas': planejadas, midiasPlanejadas: true, arquivosParciais: [], infoIlustracoes };
  }
  // Games: sempre que o jogo tem VÍDEO (gameplay/trailer oficial), as cenas mostram pedaços dele — imagem parada
  // (foto da notícia, banco de imagens) só entra quando o jogo não tem vídeo nenhum.
  if (item.games && !item.desafio && !item.videosPreferidos && !item.midiasPlanejadas && !(item.arquivosParciais || []).length) {
    const conta = new Map();
    for (const b of [item.roteiro?.capa, ...cenas.map((c) => c.busca)]) {
      if (!ehCenaDeJogo(b)) continue;
      const n = nomeDoJogo(b);
      if (n) conta.set(n, (conta.get(n) || 0) + 1);
    }
    const principal = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    // Notícia de aparelho (controle, console...): as cenas do aparelho continuam mostrando o aparelho
    const tituloH = `${item.roteiro?.titulo || ''} ${item.tema || ''}`;
    const jogoNoTitulo = principal && tituloCitaJogo(tituloH, principal) && !HARDWARE.test(tituloH);
    const hardware = !jogoNoTitulo && (ehHardware(tituloH, principal) || cenas.some((c) => ehCenaDeProduto(c.busca)));
    if (hardware) {
      // Aparelho: toda cena que pede gameplay mas cuja frase NÃO fala daquele jogo vira foto oficial da notícia
      // (o console/controle de verdade) ou a foto real do aparelho
      const fotos = cenas.map((c) => c.busca).filter((b) => ehImagemDireta(b));
      const aparelho = produtoPrincipal(cenas, item.roteiro?.capa) || produtoDoTitulo(`${item.roteiro?.titulo || ''} ${item.tema || ''}`);
      let k = 0;
      const falaDoJogo = (c) => {
        const nome = semAc(nomeDoJogo(c.busca)).split(/[:\-–]/)[0].trim();
        const t = ` ${semAc(c.textoNarrado || c.texto || '').replace(/[^a-z0-9 ]/g, ' ')} `;
        return nome && nome.split(/\s+/).filter((w) => w.length >= 4).some((w) => t.includes(` ${w} `));
      };
      const novas = cenas.map((c) => {
        if (!ehCenaDeJogo(c.busca) || falaDoJogo(c)) return c;
        if (fotos.length) return { ...c, busca: fotos[k++ % fotos.length] };
        if (aparelho) return { ...c, busca: `produto: ${aparelho}` };
        return c;
      });
      return { 'roteiro.cenas': novas, videosPreferidos: true };
    }
    const temVideo = principal ? ((await midiasDoJogo(principal).catch(() => null))?.videos || []).length > 0 : false;
    if (!temVideo) return { videosPreferidos: true };
    const novas = cenas.map((c) => (ehCenaDeJogo(c.busca) || ehCenaDeProduto(c.busca) ? c : { ...c, busca: `jogo: ${principal}`, descricao: c.descricao || principal }));
    return { 'roteiro.cenas': novas, videosPreferidos: true };
  }
  // Games (Short de notícia): a gameplay continua sendo o vídeo; só 2 ou 3 frases com DADO (preço, data, consoles,
  // comparação, requisitos) ganham um cartão desenhado POR CIMA da gameplay desfocada, com o mascote gamer.
  if (item.games && !item.ilustrado && !item.desafio && item.formato === 'short' && !item.cartoesFeitos && !item.midiasPlanejadas && !(item.arquivosParciais || []).length && (item.narracao?.palavras || []).length) {
    const { planejarIlustracoes } = await import('./politicaNoticias');
    let texto = '';
    if (item.noticia) {
      try {
        const { getDb } = await import('./firebase-admin');
        const { COLECAO_NOTICIAS } = await import('./gamesNoticias');
        const n = (await getDb().collection(COLECAO_NOTICIAS).doc(String(item.noticia)).get()).data() || {};
        texto = [n.titulo, n.texto].filter(Boolean).join('\n');
      } catch {}
    }
    const juntas = [];
    for (const c of cenas) {
      const u = juntas[juntas.length - 1];
      if (u && u.textoNarrado === c.textoNarrado && Math.abs(u.start + u.length - c.start) < 0.15) {
        u.length = Number((u.length + c.length).toFixed(2));
        u._pedacos.push(c);
      } else juntas.push({ ...c, _pedacos: [c] });
    }
    const frases = dividirPorFrases(juntas, item.narracao.palavras, { max: 6 });
    const ilus = await planejarIlustracoes(frases.map((c) => ({ texto: textoLimpo(c.textoNarrado) })), item.roteiro.titulo || item.tema || '', texto, { canal: 'games' }).catch(() => null);
    const DADOS = ['numero', 'calendario', 'checklist', 'lista', 'comparacao', 'versus', 'placar', 'linhaTempo'];
    const escolhidas = new Set();
    if (ilus) {
      // A gameplay INTEIRA na tela é o que mais prende: cartão de dado só 1 por vídeo (preço, data, número), nunca na 1ª frase
      for (let i = 1; i < frases.length - 2 && escolhidas.size < 1; i++) {
        if (ilus[i] && DADOS.includes(ilus[i].tipo) && frases[i].length >= 2.2 && !escolhidas.has(i - 1)) escolhidas.add(i);
      }
    }
    // Fim do Short: o mascote gamer pede a inscrição (por cima da gameplay), com a pergunta da última frase
    const ultima = frases.length - 1;
    if (ultima > 0 && frases[ultima].length >= 1.5 && ilus) {
      const pergunta = textoLimpo(frases[ultima].textoNarrado).replace(/\s+/g, ' ').trim();
      ilus[ultima] = { tipo: 'inscreva', etiqueta: 'COMENTE', titulo: 'Se inscreve!', destaque: 'inscreve', texto: pergunta.length <= 70 ? pergunta : 'E você, o que acha?' };
      escolhidas.add(ultima);
    }
    if (!escolhidas.size) return { cartoesFeitos: true };
    const humor = (x) => (['numero', 'versus', 'placar'].includes(x.tipo) ? 'surpreso' : 'normal');
    const novas = [];
    frases.forEach((f, i) => {
      const { _pedacos, ...base } = f;
      if (!escolhidas.has(i)) {
        // sem cartão: os pedaços de gameplay de antes, só os que caem dentro desta frase
        const fim = f.start + f.length;
        const dentro = (_pedacos || []).filter((p) => p.start < fim - 0.05 && p.start + p.length > f.start + 0.05);
        const lista = dentro.length ? dentro : [base];
        lista.forEach((p, k) => {
          const ini = Math.max(f.start, p.start);
          const ate = k === lista.length - 1 ? fim : Math.min(fim, p.start + p.length);
          novas.push({ ...p, textoNarrado: f.textoNarrado, start: Number(ini.toFixed(2)), length: Number(Math.max(0.3, ate - ini).toFixed(2)) });
        });
        return;
      }
      const ilu = { ...ilus[i], sobreJogo: true, mascote: { humor: humor(ilus[i]), roupa: { estilo: 'gamer' } } };
      novas.push({ ...base, busca: (_pedacos || [])[0]?.busca || base.busca, ilustracao: ilu });
    });
    console.log(`[games-cartoes] "${String(item.tema || '').slice(0, 50)}" | cartões nas frases ${[...escolhidas].map((i) => `${i + 1}:${ilus[i].tipo}`).join(', ')}`);
    return { 'roteiro.cenas': novas, cartoesFeitos: true };
  }
  if (item.politica && !item.midiasPlanejadas) {
    const { planejarMidiasPorFrase, planejarIlustracoes, diagIlustracao, COLECAO_POLITICA } = await import('./politicaNoticias');
    // O texto da notícia diz quem são "os seis senadores" e quais são "as quatro propostas"
    let textoNoticia = '';
    if (item.noticia) {
      try {
        const { getDb } = await import('./firebase-admin');
        const n = (await getDb().collection(COLECAO_POLITICA).doc(String(item.noticia)).get()).data() || {};
        textoNoticia = [n.titulo, n.texto].filter(Boolean).join('\n');
      } catch {
        /* sem o texto: planeja só pelas frases */
      }
    }
    // Em partes, salvando o progresso (antes era tudo de uma vez e, em vídeo longo, passava do tempo da função:
    // nada era salvo, sem erro, e o vídeo travava a fila inteira).
    // Parte 1: a imagem de cada cena pela frase
    // Parte 0: cena comprida vira uma cena por frase (a imagem acompanha o que está sendo dito)
    if (!item.midiasFrase && !item.frasesDivididas) {
      const div = dividirPorFrases(cenas, item.narracao?.palavras, { max: item.formato === 'short' ? 6.5 : 9 });
      if (div.length !== cenas.length) return { 'roteiro.cenas': div, frasesDivididas: true };
    }
    if (!item.midiasFrase) {
      const novas = await planejarMidiasPorFrase(
        cenas.map((c) => ({ midia: String(c.busca || c.descricao || ''), texto: textoLimpo(c.textoNarrado) })),
        item.roteiro.titulo || item.tema || '',
        textoNoticia
      ).catch(() => null);
      if (novas) console.log(`[politica-plano] "${String(item.tema || '').slice(0, 50)}" | ${novas.map((m, i) => `${i + 1}: ${m || '(mantém)'}`).join(' ; ')}`);
      const comBusca = novas ? cenas.map((c, i) => (novas[i] ? { ...c, busca: novas[i], descricao: novas[i] } : c)) : cenas;
      return { 'roteiro.cenas': comBusca, midiasFrase: true, ilusParcial: [] };
    }
    let planejadas = cenas;
    // Ilustrações animadas (carimbo, placar, checklist, calendário...): o Compilador desenha no PC.
    // A foto de cada cena continua sendo buscada e vira o plano B. item.semIlustracoes desliga.
    let infoIlustracoes = null;
    let estiloExplicador = false; // com ilustrações: os pedaços de foto também vão em cartão
    // "foto de: Lula" -> "Lula"; "pessoas: A; B" -> "A"; foto real/imagem/vídeo: sem nome
    const nomeDaFoto = (b) => {
      const m = String(b || '').match(/^(?:foto de|pessoas):\s*([^;|]+)/i);
      return m ? m[1].trim().slice(0, 40) : '';
    };
    const fonteDaNoticia = nomeDaFonte(item.roteiro?.descricao);
    if (!item.semIlustracoes) {
      // Parte 2: as ilustrações, 12 cenas por vez (no máximo ~100 s por rodada), guardando o que já foi feito
      const feitas = Array.isArray(item.ilusParcial) ? [...item.ilusParcial] : [];
      const diagAntes = item.ilusDiag || { erros: [], sugeridas: 0, aceitas: 0, exemploRecusado: '' };
      Object.assign(diagIlustracao, { erros: [...(diagAntes.erros || [])], sugeridas: diagAntes.sugeridas || 0, aceitas: diagAntes.aceitas || 0, exemploRecusado: diagAntes.exemploRecusado || '' });
      const t0 = Date.now();
      while (feitas.length < planejadas.length && Date.now() - t0 < 100e3) {
        const lote = planejadas.slice(feitas.length, feitas.length + 12);
        const r = await planejarIlustracoes(lote.map((c) => ({ texto: textoLimpo(c.textoNarrado) })), item.roteiro.titulo || item.tema || '', textoNoticia).catch(() => null);
        feitas.push(...(r || lote.map(() => null)));
      }
      const diagAgora = { erros: (diagIlustracao.erros || []).slice(-5), sugeridas: diagIlustracao.sugeridas || 0, aceitas: diagIlustracao.aceitas || 0, exemploRecusado: diagIlustracao.exemploRecusado || '' };
      if (feitas.length < planejadas.length) return { ilusParcial: feitas.map((x) => x || null), ilusDiag: diagAgora }; // continua na próxima rodada
      const ilus = feitas.some(Boolean) ? feitas : null;
      if (ilus) {
        // cena sem ilustração da IA vira "foto em cartão" (o vídeo inteiro fica no mesmo estilo)
        // Última cena: o bonequinho do canal faz a pergunta e aperta o botão de se inscrever (fecha todo vídeo de política)
        const ult = ilus.length - 1;
        if (ult >= 0) ilus[ult] = { tipo: 'inscreva', etiqueta: 'COMENTE', titulo: 'Se inscreve!', destaque: 'inscreve', texto: String(ilus[ult]?.texto || 'E você, o que acha?').slice(0, 40) };
        // Mascote apresentador do canal em todas as ilustrações, inclusive no fecho pedindo a inscrição:
        // a cara dele acompanha o assunto (surpreso com número/mapa, sério com decisão/documento)
        const humorDe = (x) => (x.clima === 'ruim' ? 'triste' : ['numero', 'placar', 'versus', 'mapa', 'quadroFotos'].includes(x.tipo) ? 'surpreso' : ['documento', 'carimbo'].includes(x.tipo) || x.cor === 'vermelho' ? 'serio' : 'normal');
        const comMascote = (x) => ({ ...x, mascote: { humor: humorDe(x) } }); // no fecho (inscreva/pergunta) o mascote é o personagem grande
        // Quadro de fotos: a foto real de cada pessoa (Wikipédia/Commons); sem foto, fica a silhueta com o nome
        var videosNoVideo = 0; // eslint-disable-line no-var
        var videosUsados = new Set(); // eslint-disable-line no-var
        for (const ilu of ilus) {
          // "fala": foto da própria pessoa (a imagem da cena às vezes era logo ou prédio)
          if (ilu?.tipo === 'fala' && ilu.nome) {
            const foto = await fotoDePessoa(ilu.nome, new Set(), 0).catch(() => null);
            if (foto?.imageUrl) ilu.fotoUrl = foto.imageUrl;
            // vídeo livre da pessoa falando (Commons, licença CC): no lugar da foto parada, no máximo 2 por vídeo
            if (videosNoVideo < 2) {
              const v = await videoDePessoaCommons(ilu.nome).catch(() => null);
              if (v && !videosUsados.has(v.id)) {
                Object.assign(ilu, { videoUrl: v.videoUrl, videoInicio: v.inicio, videoCredito: v.credito });
                videosUsados.add(v.id);
                videosNoVideo++;
              }
            }
            continue;
          }
          if (ilu?.tipo !== 'quadroFotos') continue;
          for (const f of ilu.fotos) {
            const foto = await fotoDePessoa(f.nome, new Set(), 0).catch(() => null);
            if (foto?.imageUrl) f.url = foto.imageUrl;
          }
        }
        planejadas = planejadas.map((c, i) => {
          const ilu = comMascote(ilus[i] || { tipo: 'foto', etiqueta: '', titulo: '' });
          if (ilu.tipo === 'foto') return { ...c, ilustracao: { ...ilu, legenda: nomeDaFoto(c.busca) } };
          // fala: a foto da cena é da pessoa que falou; o nome vem da busca da cena quando houver
          if (ilu.tipo === 'fala') return { ...c, ilustracao: { ...ilu, nome: nomeDaFoto(c.busca) || ilu.nome } };
          // Dado, número, data ou documento: mostra de onde veio, em letra pequena embaixo do desenho
          if (fonteDaNoticia && !SEM_FONTE.has(ilu.tipo)) return { ...c, ilustracao: { ...ilu, fonte: fonteDaNoticia } };
          return { ...c, ilustracao: ilu };
        });
        estiloExplicador = true;
        console.log(`[politica-ilustracao] "${String(item.tema || '').slice(0, 50)}" | ${ilus.map((x, i) => `${i + 1}: ${x ? x.tipo : '-'}`).join(' ; ')}`);
      }
      // guardado no vídeo: o diagnóstico mostra o que a IA fez (sugeriu, aceitas pela conferência, erros)
      infoIlustracoes = { cenas: planejadas.length, sugeridas: diagIlustracao.sugeridas || 0, aceitas: diagIlustracao.aceitas || 0, erros: diagIlustracao.erros || [], exemploRecusado: diagIlustracao.exemploRecusado || '', em: new Date().toISOString() };
    }
    // Política: troca de foto a cada ~2 s no Short e a cada ~5 s no vídeo longo (foto parada muito tempo faz a pessoa sair).
    // Cada pedaço da mesma pessoa pega outra foto dela; a foto da notícia vira a pessoa principal nos pedaços seguintes.
    const curto = item.formato === 'short';
    const PEDACO = curto ? 3.5 : 5; // Short mais calmo: a informação não passa correndo
    const MAX_ILU = 8; // ilustração parada mais que isso cansa: o resto da cena vai com fotos
    if (planejadas.every((c) => typeof c.start === 'number' && typeof c.length === 'number')) {
      const nomes = {};
      for (const c of planejadas) {
        const b = String(c.busca || '');
        if (/^foto de:/i.test(b)) nomes[b] = (nomes[b] || 0) + 1;
      }
      const principal = Object.entries(nomes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const curtas = [];
      for (let c of planejadas) {
        const fotoCartao = c.ilustracao?.tipo === 'foto' ? c.ilustracao : null;
        if (fotoCartao) {
          // foto em cartão: troca de foto como antes (pedaços), cada pedaço no cartão com o nome certo
          const { ilustracao, ...resto } = c;
          c = { ...resto, _cartao: { etiqueta: fotoCartao.etiqueta, titulo: fotoCartao.titulo } };
        } else if (c.ilustracao && c.length <= MAX_ILU + 1.5) {
          curtas.push(c); // cena ilustrada: a animação ocupa a cena inteira (não vira pedaços)
          continue;
        }
        if (c.ilustracao && !fotoCartao) {
          // cena longa: ilustração nos primeiros ~7 s, depois fotos do assunto
          const iluLen = Math.min(7, c.length);
          curtas.push({ ...c, length: Number(iluLen.toFixed(2)) });
          const { ilustracao, ...resto } = c;
          c = { ...resto, _cartao: { etiqueta: ilustracao.etiqueta || '', titulo: ilustracao.titulo || '' }, start: Number((c.start + iluLen).toFixed(2)), length: Number((c.length - iluLen).toFixed(2)) };
        }
        const b0 = String(c.busca || '');
        // "vídeo atual" genérico de Brasília (Congresso, Esplanada...) não se repete: os pedaços alternam com a pessoa principal
        const generico = /^v[íi]deo atual:/i.test(b0) && /bras[íi]lia|congress|esplanada|planalto|ministr/i.test(b0);
        const lista = /^(pessoas|documentos):/i.test(b0) ? b0.replace(/^[^:]+:\s*/, '').split(';').map((x) => x.trim()).filter(Boolean) : null;
        const tipo = /^pessoas:/i.test(b0) ? 'foto de' : 'documento';
        // Grupo de pessoas/documentos: pedaços de ~2,2 s para dar tempo de mostrar todos
        // Troca de imagem a cada ~2 s (o que prende num Short); grupo de pessoas/documentos: um por pedaço
        const partes = lista
          ? curto
            ? Math.max(1, Math.min(lista.length, Math.ceil(c.length / 2.5)))
            : Math.max(1, Math.min(lista.length, Math.floor(c.length / 3)), Math.ceil(c.length / PEDACO))
          : c.length > PEDACO * 1.2 ? Math.ceil(c.length / PEDACO) : 1;
        const fatia = c.length / partes;
        for (let k = 0; k < partes; k++) {
          const busca = lista
            ? `${tipo}: ${lista[k % lista.length]}`
            : k > 0 && principal && (/^imagem:/i.test(b0) || ((generico || (!curto && /^documento:/i.test(b0))) && k % 2 === 1))
              ? principal
              : c.busca;
          const { _cartao, ...semCartao } = c;
          curtas.push({
            ...semCartao, busca, descricao: busca, ...(k > 0 ? { local: undefined } : {}), start: Number((c.start + k * fatia).toFixed(2)), length: Number(fatia.toFixed(2)),
            // estilo explicador: a foto vai num cartão com o nome; do 2º pedaço em diante o cartão já está na tela (só troca a foto)
            ...(estiloExplicador ? { ilustracao: { tipo: 'foto', etiqueta: _cartao?.etiqueta || '', titulo: _cartao?.titulo || '', legenda: nomeDaFoto(busca), ...(k > 0 ? { continua: true } : {}) } } : {}),
          });
        }
      }
      planejadas = curtas.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)));
    }
    // Vídeo livre da pessoa (Commons) também no cartão de foto: 1º pedaço de cada pessoa, até 2 vídeos no total por vídeo
    if (estiloExplicador && item.politica) {
      let n = planejadas.filter((c) => c.ilustracao?.videoUrl).length;
      const usadosV = new Set();
      const jaPessoa = new Set();
      for (const c of planejadas) {
        if (n >= 2) break;
        const ilu = c.ilustracao;
        if (ilu?.tipo !== 'foto' || ilu.continua || !ilu.legenda || c.length < 2.5) continue;
        const ch = semAcento(ilu.legenda);
        if (jaPessoa.has(ch)) continue;
        jaPessoa.add(ch);
        const v = await videoDePessoaCommons(ilu.legenda).catch(() => null);
        if (!v || usadosV.has(v.id)) continue;
        c.ilustracao = { ...ilu, videoUrl: v.videoUrl, videoInicio: v.inicio, videoCredito: v.credito };
        usadosV.add(v.id);
        n++;
      }
    }
    const creditosVideo = [...new Set(planejadas.map((c) => c.ilustracao?.videoCredito).filter(Boolean))];
    // Mapa no vídeo: crédito da licença (CC BY 4.0) no fim da descrição
    const temMapa = planejadas.some((c) => c.ilustracao?.tipo === 'mapa');
    const desc = String(item.roteiro?.descricao || '');
    let descNova = desc.split(/\n\nImagens: /)[0].split(/\n\nVídeos: /)[0];
    if (temMapa && !/svg-maps/i.test(descNova)) descNova = `${descNova}\n\nMapas: SVG Maps (svg-maps.com), licença CC BY 4.0.`.trim();
    // Crédito dos vídeos livres (CC BY pede o nome do autor); antes do bloco "Imagens:", que é refeito depois
    if (creditosVideo.length) descNova = `${descNova}\n\nVídeos: ${creditosVideo.join('\n')}`.trim();
    const credito = descNova !== desc ? { 'roteiro.descricao': descNova.slice(0, 4900) } : {};
    // Fundo das ilustrações (o dono gostou de 2): um vídeo "tv", o outro "claro" — a retenção mostra qual segura mais
    let fundoIlustracao = item.fundoIlustracao;
    if (!fundoIlustracao) {
      const semente = String(item.roteiro?.titulo || item.tema || '');
      let h = 0;
      for (const ch of semente) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      fundoIlustracao = h % 2 ? 'tv' : 'claro';
    }
    for (const c of planejadas) if (c.ilustracao) c.ilustracao.fundo = fundoIlustracao;
    return { 'roteiro.cenas': planejadas, midiasPlanejadas: true, arquivosParciais: [], fundoIlustracao, ...credito, ...(infoIlustracoes ? { infoIlustracoes } : {}) };
  }
  const feitas = [...(item.arquivosParciais || [])];
  // evitarMidias: imagens que a conferência final recusou (correção automática): nunca voltam
  const usados = new Set([...feitas.map((a) => a.midiaId), ...(item.evitarMidias || [])].filter(Boolean));
  const reservados = new Set(); // Brasil: foto do acervo já em conferência por outra cena do mesmo lote
  let capaUrl = item.capaUrl || null;
  // Games: a capa é a ARTE do jogo principal do vídeo (personagem/logo grandes: GTA, Goku...), não a foto da notícia
  if (!capaUrl && item.games && !item.desafio) {
    const contagem = new Map();
    for (const b of [item.roteiro.capa, ...cenas.map((c) => c.busca)]) {
      if (!ehCenaDeJogo(b)) continue;
      const n = nomeDoJogo(b);
      contagem.set(n, (contagem.get(n) || 0) + (b === item.roteiro.capa ? 3 : 1));
    }
    const principal = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const tituloG = `${item.roteiro?.titulo || ''} ${item.tema || ''}`;
    // Jogo citado no título ("GTA 6 em 30 FPS no PS5"): a capa é a arte do JOGO, mesmo que alguma cena mostre o console
    // (antes a foto do PS5 da Wikipédia virava a capa de todo vídeo assim — sempre a mesma)
    const jogoNoTitulo = principal && tituloCitaJogo(tituloG, principal) && !HARDWARE.test(tituloG);
    const prod = jogoNoTitulo ? '' : produtoPrincipal(cenas, item.roteiro.capa) || (ehHardware(tituloG, principal) ? produtoDoTitulo(tituloG) : '');
    if (!jogoNoTitulo && (prod || ehHardware(tituloG, principal))) {
      // Notícia de aparelho: a capa é o aparelho (não a arte de um jogo citado de passagem)
      const fp = prod ? await fotoDoProduto(prod, new Set(), null).catch(() => null) : null;
      capaUrl = fp?.imageUrl || fp?.url || null;
    } else if (principal) capaUrl = await arteDoJogo(principal, { vertical: item.formato === 'short' }).catch(() => null);
  }
  if (!capaUrl && item.roteiro.capa && ehImagemDireta(item.roteiro.capa)) capaUrl = midiaImagemDireta(item.roteiro.capa)?.imageUrl || null;
  if (!capaUrl && item.roteiro.capa && ehCenaDeJogo(item.roteiro.capa)) {
    // Canal de games: a capa é uma arte/screenshot oficial do jogo
    capaUrl = await capaDeJogo(item.roteiro.capa).catch(() => null);
  }
  if (!capaUrl && item.roteiro.capa && !ehCenaDeJogo(item.roteiro.capa) && !ehImagemDireta(item.roteiro.capa)) {
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
      brasil: !!item.brasil,
    };
  };
  // 5 buscas ao mesmo tempo, até 40 cenas por rodada (antes era 1 por vez e 10 por rodada)
  const PARALELO = 5;
  const montar = (c, m) => ({
    cena: c.busca || c.descricao,
    // Imagem oficial do jogo é sempre a certa: não passa pela conferência da IA
    conferida: !!process.env.GEMINI_API_KEY || ehCenaDeJogo(c.busca || c.descricao) || ehImagemDireta(c.busca || c.descricao),
    ...(c.local ? { local: c.local } : {}),
    // Movimento de graça por cima da foto/ilustração (chuva, névoa, luz de vela...), escolhido pelo texto da cena
    ...(item.roteiro.epoca ? { movimento: String(c.busca || '').replace(/^[^:]*:\s*/, '').slice(0, 200) } : {}),
    start: c.start ?? null,
    length: c.length ?? null,
    ...(c.ilustracao ? { ilustracao: c.ilustracao } : {}),
    ...(m
      ? {
          midiaId: m.id,
          imageUrl: m.imageUrl || null,
          ...(m.videoUrl ? { videoUrl: m.videoUrl, videoLoop: true, duracao: m.duracao || null } : {}),
          ...(m.videoInicio != null ? { videoInicio: m.videoInicio } : {}), // trailer: começa neste segundo
          ...(m.credito ? { credito: m.credito } : {}),
          ...(m.jogo ? { jogo: m.jogo } : {}),
          ...(m.via ? { via: m.via } : {}),
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
          // Canal de política: só foto de agência pública (uso livre) ou vídeo real de banco. NUNCA pintura/ilustração de IA
          // (não pode inventar imagem de político real). Sem vídeo que combine, usa um vídeo geral de Brasília/bandeira.
          if (item.politica) {
            // ESTILO QUADRINHO (teste): cena de objeto/lugar vira ilustração de quadrinho feita pela IA.
            // Pessoa continua com FOTO REAL (nunca rosto de político feito por IA); foto da própria notícia também fica.
            const b0 = String(c.busca || c.descricao || '');
            if (item.quadrinho && !ehImagemDireta(b0) && !/^(foto de|foto real|pessoas|documento|documentos):/i.test(b0)) { // "foto real" = lugar/objeto de verdade (o tríplex, o prédio): mostra a FOTO, não desenho
              try {
                const { imagemGemini } = await import('./thumbGemini');
                const { put } = await import('@vercel/blob');
                const assuntoQ = b0.replace(/^[^:]*:\s*/, '').slice(0, 160);
                const promptQ =
                  `Vertical 9:16 illustration in a bold modern COMIC BOOK / graphic novel style (clean ink lines, cel shading, rich dramatic colors, cinematic light), for a Brazilian politics news video.\n` +
                  `It must illustrate this sentence of the narration: "${String(ctx.trecho || '').slice(0, 300)}" (news: "${String(ctx.tema || '').slice(0, 160)}"; subject: ${assuntoQ}).\n` +
                  'Show it ONLY with objects, places and symbols (documents, stamps, gavel, money, charts, buildings, maps, phones, food, prices, flags...), one big clear hero element.\n' +
                  'ABSOLUTELY NO PEOPLE: no faces, no human figures, no silhouettes, no hands of identifiable people, no politicians. No text, no letters, no logos, no watermark. Faithful to the sentence, no exaggeration.';
                const img = await imagemGemini(promptQ, '9:16', [], ['gemini-2.5-flash-image']);
                const bl = await put(`quadrinho/cena-${Date.now()}.${/jpe?g/.test(img.mime) ? 'jpg' : 'png'}`, img.buffer, { access: 'public', contentType: img.mime, token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: true });
                console.log(`[politica-quadrinho] "${String(item.tema || '').slice(0, 50)}" | ${assuntoQ.slice(0, 60)} | frase: ${String(ctx.trecho || '').slice(0, 80)}`);
                return { m: { id: `quad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, imageUrl: bl.url, credito: 'Ilustração', via: 'quadrinho' } };
              } catch (e) {
                console.log(`[politica-quadrinho] falhou, usa foto: ${String(e.message || e).slice(0, 120)}`);
              }
            }
            if (ehImagemDireta(c.busca || c.descricao)) {
              const foto = midiaImagemDireta(c.busca || c.descricao);
              // A foto da própria notícia também passa pela IA: print de site, de busca do YouTube ou de app não entra
              const confereFoto = conferidorPolitica(ctx);
              if (foto && (!confereFoto || (await confereFoto(foto)))) return { m: foto };
            }
            // "@ foto de: Nome": foto real da pessoa (Commons/Agência Brasil); se não achar, segue para o vídeo de banco
            const bruta = String(c.busca || c.descricao || '');
            const registrar = (m, via) => {
              console.log(`[politica-midia] "${String(item.tema || '').slice(0, 50)}" | ${bruta.slice(0, 60)} | ${via} | ${m?.credito || m?.id || 'nada'} | frase: ${String(ctx.trecho || '').slice(0, 90)}`);
              return { m };
            };
            const nomeDe = (b) => String(b || '').replace(/^foto de:\s*/i, '').split('|')[0].trim();
            // "@ documento: PEC 45/2019 | Reforma tributária": a 1ª página do documento de verdade (ou um cartão com o nome)
            let brutaUsada = bruta;
            if (/^(pessoas|documentos):/i.test(bruta)) {
              const primeiro = bruta.replace(/^[^:]+:\s*/, '').split(';')[0].trim();
              brutaUsada = /^pessoas:/i.test(bruta) ? `foto de: ${primeiro}` : `documento: ${primeiro}`;
            }
            if (/^documento:/i.test(brutaUsada)) {
              const { midiaDeDocumento } = await import('./documentoOficial');
              const doc = await midiaDeDocumento(brutaUsada).catch(() => null);
              if (doc) return registrar(doc, 'documento');
            }
            if (/^foto de:/i.test(brutaUsada)) {
              const nome = nomeDe(brutaUsada);
              const idx = cenas.indexOf(c);
              const ordem = cenas.slice(0, Math.max(0, idx)).filter((x) => /^foto de:/i.test(String(x.busca || '')) && semAcento(nomeDe(x.busca)) === semAcento(nome)).length;
              const foto = await fotoDePessoa(nome, usados, ordem).catch(() => null);
              if (foto) return registrar(foto, 'pessoa');
            }
            // "@ foto real: <assunto em português>": foto de verdade do assunto (Wikimedia Commons, onde ficam as fotos
            // da Agência Brasil, Senado e Câmara), conferida pela IA; é o que mais combina com a notícia
            if (/^foto real:/i.test(brutaUsada)) {
              const q = brutaUsada.replace(/^foto real:\s*/i, '').trim();
              // 1º a foto principal da Wikipédia daquele lugar/instituição (ex.: "Estúdios Globo", "Senado Federal do Brasil"): é o lugar certo
              const daWiki = await fotoDaWikipedia(q).catch(() => null);
              if (daWiki && !usados.has(daWiki.id)) return registrar(daWiki, 'lugar (Wikipédia)');
              const confere = conferidorPolitica(ctx);
              let conferidos = 0;
              for (const termo of [q, q.split(/\s+/).slice(0, 3).join(' ')]) {
                const lista = await commonsFoto(termo, usados, 800).catch(() => []);
                for (const cand of lista) {
                  if (usados.has(cand.id) || conferidos >= 5) continue;
                  conferidos++;
                  if (!confere || (await confere(cand))) return registrar(cand, 'foto real');
                }
              }
            }
            const lugarCena = lugarDaNoticia(textoLimpo(c.textoNarrado), item.roteiro.titulo || item.tema);
            // Banco de vídeos/fotos com o ASSUNTO da cena (antes "foto real: Cebola" sem foto virava busca por
            // "brasilia national congress building": o vídeo mostrava Brasília falando de cebola)
            const assunto = /^foto real:/i.test(brutaUsada) ? brutaUsada.replace(/^foto real:\s*/i, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim() : '';
            const buscas = ehImagemDireta(brutaUsada) || /^(foto (de|real)|documento):/i.test(brutaUsada) ? [assunto, lugarCena?.buscas?.[0]].filter(Boolean) : [brutaUsada];
            for (const busca of buscas) {
              const doBanco = await buscarBanco(busca, usados, conferidorPolitica(ctx)).catch(soLimite);
              if (doBanco) return registrar(doBanco, 'banco');
            }
            // Nada combinou: a pessoa principal da notícia (a mais citada nas cenas) é melhor do que Brasília
            const contagem = {};
            for (const x of cenas) if (/^foto de:/i.test(String(x.busca || ''))) contagem[nomeDe(x.busca)] = (contagem[nomeDe(x.busca)] || 0) + 1;
            // (as listas "pessoas:" já viraram "foto de:" pedaço a pedaço no plano)
            const principal = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0];
            // Só põe a pessoa principal se a FRASE fala dela (antes a foto do Flávio Dino cobria cenas de comércio,
            // salário, calendário... de uma notícia em que ele só aparecia de passagem)
            const falaDela = (nome) => {
              const t = ` ${semAcento(ctx.trecho).replace(/[^a-z0-9 ]/g, ' ')} `;
              return semAcento(nomeCompleto(nome)).split(/\s+/).filter((w) => w.length >= 4 && !['silva', 'santos', 'souza', 'oliveira'].includes(w)).some((w) => t.includes(` ${w} `));
            };
            if (principal && falaDela(principal)) {
              const foto = await fotoDePessoa(principal, usados, cenas.indexOf(c)).catch(() => null);
              if (foto) return registrar(foto, 'pessoa principal');
            }
            // Nada do assunto: repete a imagem boa da cena anterior deste vídeo (combina com a notícia) em vez de
            // um vídeo genérico de Brasília. Brasília só se o vídeo ainda não tem nenhuma imagem boa.
            if (lugarCena) {
              const doPais = await videoDePolitica(usados, lugarCena).catch(() => null);
              if (doPais) return registrar(doPais, 'reserva do país da notícia');
            }
            const anterior = [...feitas].reverse().find((a) => (a.imageUrl || a.videoUrl) && !a.erro && !/reserva/i.test(a.via || ''));
            if (anterior) return registrar({ id: `${anterior.midiaId || 'rep'}_r${Math.random().toString(36).slice(2, 6)}`, imageUrl: anterior.imageUrl || null, ...(anterior.videoUrl ? { videoUrl: anterior.videoUrl, duracao: anterior.duracao || null } : {}), credito: anterior.credito || '' }, 'repete a cena anterior');
            return registrar({ ...(await videoDePolitica(usados, null)), via: 'reserva' }, 'reserva Brasília');
          }
          // "@ jogo: Nome" (canal de games): imagem/trailer oficial do jogo, sem conferência nem pintura
          if (ehCenaDeJogo(c.busca || c.descricao))
            return {
              m:
                (await midiaDeJogo(c.busca || c.descricao, usados)) ||
                (item.games ? await jogoCerto(item, cenas).then((jv) => (jv ? midiaDeJogo(`jogo: ${jv}`, usados) : null)).catch(() => null) : null) ||
                (item.games ? await buscarMidiaReal('vídeo atual: gamer playing video game', usados).catch(() => null) : null),
            };
          // "@ imagem: https://..." (notícia de blog oficial): a própria foto da notícia
          if (ehImagemDireta(c.busca || c.descricao)) {
            const foto = midiaImagemDireta(c.busca || c.descricao);
            // Desafio: a imagem pixelada é de propósito (a IA recusaria por estar "borrada")
            if (item.desafio && foto) return { m: foto };
            const confere = conferidorGames({ assunto: ctx.tema, trecho: ctx.trecho });
            // Foto da notícia que é print de site, interface do YouTube etc.: troca por vídeo real de games
            if (foto && (!confere || (await confere(foto)))) return { m: foto };
            return { m: await videoDeGames(usados, ctx) };
          }
          // "@ ilustração: ..." no episódio: a cena é ilustrada pela IA, sem procurar foto
          // (antes, se houver vídeo real que combine com a cena, ele ganha da ilustração)
          // Brasil Inacreditável: primeiro as fotos/vídeos reais do próprio caso (Wikipédia/Commons), conferidos pela IA
          if (item.brasil && !/^v[íi]deo atual:/i.test(c.busca || '')) {
            const acervo = await acervoDaHistoria(termosDoAcervo(item)).catch(() => []);
            const confere = conferidorDeCena(ctx);
            let tentou = 0;
            for (const cand of acervo) {
              if (usados.has(cand.id) || reservados.has(cand.id) || tentou >= 3) continue;
              tentou++;
              reservados.add(cand.id);
              if (!confere || (await confere(cand))) return { m: cand };
              reservados.delete(cand.id);
            }
          }
          if (ehIlustracao(c.busca || c.descricao)) return { m: (await tentarVideos(ctx.busca, usados, conferidorDeCena(ctx), 3)) || (await pinturaDaCena(ctx)) };
          // Canal de games: o vídeo de banco precisa ter cara de games (nada de luzes desfocadas ou cidade qualquer)
          // Canal de games: se a notícia tem um jogo, TODA cena de banco vira trecho do trailer/gameplay dele
          // (o público quer ver o jogo, não pinball, carro ou paisagem). Sem jogo: só bancos atuais, conferido pela IA.
          if (item.games) {
            const confereG = conferidorGames({ assunto: ctx.tema, trecho: ctx.trecho });
            const tituloG = `${item.roteiro?.titulo || ''} ${item.tema || ''}`;
            const jp = await jogoCerto(item, cenas); // o jogo do TÍTULO (nunca o citado de passagem)
            const hw = ehHardware(tituloG, jp);
            const jogoNoTitulo = jp && tituloCitaJogo(tituloG, jp) && !HARDWARE.test(tituloG);
            // Jogo no título: só a cena que pede o aparelho mostra o aparelho; as outras mostram o jogo
            const prod = ehCenaDeProduto(c.busca) ? c.busca : jogoNoTitulo ? '' : produtoPrincipal(cenas, item.roteiro?.capa) || (hw ? produtoDoTitulo(tituloG) : '');
            if (prod || hw) {
              // Notícia de aparelho: foto do aparelho; senão a foto da notícia; nunca a gameplay de outro jogo
              const fp = prod ? await fotoDoProduto(prod, usados, confereG).catch(() => null) : null;
              if (fp) return { m: fp };
              const daNoticia = cenas.map((x) => x.busca).filter((b) => ehImagemDireta(b)).map((b) => midiaImagemDireta(b)).find((m) => m && !usados.has(m.id));
              if (daNoticia) return { m: daNoticia };
              if (!ehCenaDeJogo(c.busca)) return { m: (await buscarBanco(c.busca || c.descricao, usados, confereG).catch(soLimite)) || (await videoDeGames(usados, ctx)) };
            }
            // Sem "@ jogo:" no roteiro: o jogo/franquia do título (nada de carro, cidade ou banco genérico num vídeo de Dragon Ball)
            const jv = jp;
            if (jv) {
              const mj = await midiaDeJogo(`jogo: ${jv}`, usados).catch(() => null);
              if (mj) return { m: mj };
            }
            return { m: (await buscarBanco(c.busca || c.descricao, usados, conferidorGames({ assunto: ctx.tema, trecho: ctx.trecho })).catch(soLimite)) || (await videoDeGames(usados, ctx)) };
          }
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
      // (limite da Pexels aqui: fica com a mídia repetida em vez de derrubar a rodada)
      if (m && usados.has(m.id)) try {
        const c = lote[k];
        const ctx = contexto(c);
        // Ilustração que pegou o mesmo vídeo de outra cena do lote: vira ilustração mesmo
        m = item.politica && /^(documento|documentos):/i.test(String(c.busca || c.descricao || ''))
          ? { ...m, id: `${m.id}_${k}` } // o mesmo documento em dois pedaços: pode repetir
          : item.games && !ehImagemDireta(c.busca || c.descricao) && !ehCenaDeJogo(c.busca || c.descricao)
          ? await (async () => {
              const jp = await jogoCerto(item, cenas);
              return (jp ? await midiaDeJogo(`jogo: ${jp}`, usados).catch(() => null) : null) || (await videoDeGames(usados, ctx));
            })()
          : item.politica && /^foto de:/i.test(String(c.busca || c.descricao || ''))
          ? { ...m, id: `${m.id}_${k}` } // a mesma foto da pessoa em duas cenas: pode repetir
          : item.politica && !ehImagemDireta(c.busca || c.descricao)
          ? (await buscarBanco(c.busca || c.descricao, usados, conferidorPolitica(ctx)).catch(soLimite)) || (await videoDePolitica(usados, lugarDaNoticia(ctx.trecho, ctx.tema)))
          : ehImagemDireta(c.busca || c.descricao)
          ? { ...m, id: `${m.id}_${k}` } // a mesma foto oficial em duas cenas: pode repetir
          : ehCenaDeJogo(c.busca || c.descricao)
          ? await midiaDeJogo(c.busca || c.descricao, usados).catch(() => null)
          : ehIlustracao(c.busca || c.descricao)
          ? await pinturaDaCena(ctx)
          : await buscarMidiaReal(c.busca || c.descricao, usados, conferidorDeCena(ctx)).catch(() => null);
      } catch (e2) {
        if (e2?.message !== LIMITE_PEXELS) throw e2;
        m = { ...m, id: `${m.id}_${k}` };
      }
      if (m) usados.add(m.id);
      feitas.push(montar(lote[k], m));
    }
  }
  // Pexels pediu pausa (limite por hora): este vídeo fica de lado 15 min e os outros da fila andam
  if (feitas.length < cenas.length) return { arquivosParciais: feitas, ...(capaUrl ? { capaUrl } : {}), ...(limitado ? { pausaMidiaAte: Date.now() + 15 * 60e3 } : {}) };

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
  // Tira os créditos de uma rodada anterior (refazer as imagens repetia o bloco "Imagens: ..." várias vezes)
  const base = String(item.roteiro.descricao || '').split(/\n\nImagens: /)[0];
  if (item.games) {
    // Games: crédito do material oficial de divulgação (e das fotos do Pexels/Wikimedia, se alguma cena usou)
    const extra = [creditoGames(feitas), ...creditos].filter(Boolean).join('\n');
    if (extra) atualizacao['roteiro.descricao'] = `${base}\n\n${extra}`.slice(0, 4900);
  } else if (creditos.length) {
    atualizacao['roteiro.descricao'] = `${base}\n\nImagens: Pexels e Wikimedia Commons.\n${creditos.join('\n')}`.slice(0, 4900);
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
export async function thumbDocumentario({ fotoUrl, texto, subtitulo = '', arte = '', chamada }) {
  const fundo = (await pinturaDaCapa(arte).catch(() => null)) || fotoUrl;
  if (!fundo) return null;
  if (!texto) return fundo;
  try {
    // Texto montado aqui mesmo (sem Shotstack): letras medievais Cinzel, moeda do canal e moldura dourada
    const { montarCapa } = await import('./capaDocumentario');
    const jpg = await montarCapa({ fundoUrl: fundo, texto, subtitulo, ...(chamada ? { chamada } : {}) });
    const { put } = await import('@vercel/blob');
    const blob = await put(`doc-capa-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
    return blob.url;
  } catch {
    /* sem texto: fica a pintura (ou a foto) */
  }
  return fundo;
}


// Ilustrações que não levam "Fonte:" (pessoa falando, foto, chamada para se inscrever)
const SEM_FONTE = new Set(['foto', 'fala', 'quadroFotos', 'inscreva', 'pergunta']);
const NOMES_FONTE = [
  [/g1\.globo/, 'g1'], [/agenciabrasil/, 'Agência Brasil'], [/senado\.leg/, 'Agência Senado'], [/camara\.leg/, 'Agência Câmara'],
  [/stf\.jus/, 'STF'], [/tse\.jus/, 'TSE'], [/folha\.uol/, 'Folha de S.Paulo'], [/estadao/, 'Estadão'], [/cnnbrasil/, 'CNN Brasil'],
  [/poder360/, 'Poder360'], [/uol\.com/, 'UOL'], [/oglobo/, 'O Globo'], [/metropoles/, 'Metrópoles'], [/valor\.globo/, 'Valor'],
  [/infomoney/, 'InfoMoney'], [/bbc\./, 'BBC'], [/veja\.abril/, 'Veja'], [/gov\.br/, 'gov.br'], [/ibge/, 'IBGE'],
];
/** "📰 Fonte: Agência Brasil — link" ou "Fontes consultadas: • título: url" -> nome curto do veículo */
function nomeDaFonte(descricao) {
  const d = String(descricao || '');
  const m = d.match(/📰 Fonte:\s*([^—\n]+?)\s*(?:—|\n|$)/);
  if (m && m[1].trim()) return m[1].trim().slice(0, 40);
  const urls = [...d.matchAll(/https?:\/\/([^/\s]+)/g)].map((x) => x[1].toLowerCase()).filter((h) => !/youtube|youtu\.be|instagram|tiktok|pexels|wikimedia|wikipedia/.test(h));
  const nomes = [];
  for (const h of urls) {
    const n = (NOMES_FONTE.find(([re]) => re.test(h)) || [])[1] || h.replace(/^www\d*\./, '').replace(/\.(com|org|net|gov|leg|jus|ebc)(\.br)?$|\.br$/, '');
    if (!nomes.includes(n)) nomes.push(n);
    if (nomes.length === 2) break;
  }
  return nomes.join(', ').slice(0, 40);
}
