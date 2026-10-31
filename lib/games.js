// Canal de games "Próxima Fase": lançamentos, notícias e listas de jogos.
// Os episódios são escritos em lib/gamesEpisodios no MESMO formato dos documentários
// (lib/documentario.js) e passam pela mesma Fábrica (voz, cenas, montagem no PC).
// A diferença está nas cenas e na capa:
//
//   @ jogo: Red Dead Redemption 2   -> imagens OFICIAIS do jogo (material de divulgação da produtora):
//                                      1º IGDB (screenshots e artes; precisa TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET),
//                                      2º página do jogo na Steam (screenshots e trailers oficiais).
//                                      Cada cena do mesmo jogo pega uma imagem diferente.
//   @ jogo: GTA VI | Grand Theft Auto VI  -> o que vem depois do | é só o quadrinho na tela (como nos documentários)
//
// Regra do canal: NUNCA usar gameplay de outros youtubers ou streamers. Só material oficial.

const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';
export const ehCenaDeJogo = (b) => /^jogo:/i.test(String(b || '').trim());
export const nomeDoJogo = (b) => String(b || '').replace(/^jogo:\s*/i, '').trim();

// ───────────────────────── IGDB (Twitch) ─────────────────────────

let tokenIgdb = null; // { valor, expira }

async function tokenTwitch() {
  const id = process.env.TWITCH_CLIENT_ID;
  const segredo = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !segredo) return null;
  if (tokenIgdb && tokenIgdb.expira > Date.now() + 60e3) return tokenIgdb.valor;
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(segredo)}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!r.ok) return null;
  const d = await r.json();
  tokenIgdb = { valor: d.access_token, expira: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tokenIgdb.valor;
}

const imagemIgdb = (imageId) => `https://images.igdb.com/igdb/image/upload/t_1080p/${imageId}.jpg`;
const conferirIgdb = (imageId) => `https://images.igdb.com/igdb/image/upload/t_screenshot_med/${imageId}.jpg`;

/** Screenshots e artes oficiais do jogo no IGDB. Devolve [{ id, imageUrl, conferir, credito }]. */
async function igdbImagens(nome) {
  const token = await tokenTwitch();
  if (!token) return [];
  const busca = nome.replace(/"/g, '');
  const r = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: `search "${busca}"; fields name,screenshots.image_id,screenshots.width,screenshots.height,artworks.image_id,artworks.width,artworks.height; limit 5;`,
  });
  if (!r.ok) return [];
  const jogos = await r.json();
  if (!Array.isArray(jogos) || !jogos.length) return [];
  // O mais parecido com o nome pedido (a busca do IGDB às vezes traz DLC ou edição antes do jogo)
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const alvo = norm(nome);
  const jogo = jogos.find((j) => norm(j.name) === alvo) || jogos.find((j) => (j.screenshots || j.artworks || []).length) || jogos[0];
  const deitada = (x) => !x.width || !x.height || x.width >= x.height;
  const lista = [...(jogo.screenshots || []), ...(jogo.artworks || [])].filter((x) => x.image_id && deitada(x));
  return lista.map((x) => ({
    id: `ig${x.image_id}`,
    imageUrl: imagemIgdb(x.image_id),
    conferir: conferirIgdb(x.image_id),
    credito: null,
    jogo: jogo.name,
  }));
}

// ───────────────────────── Steam ─────────────────────────

/** Acha o jogo na loja da Steam pelo nome. Devolve o appid ou null. */
async function steamAppId(nome) {
  const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(nome)}&l=portuguese&cc=BR`, {
    headers: { 'User-Agent': UA },
  });
  if (!r.ok) return null;
  const d = await r.json();
  const itens = d.items || [];
  if (!itens.length) return null;
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const alvo = norm(nome);
  return (itens.find((i) => norm(i.name) === alvo) || itens[0]).id;
}

/** Screenshots e trailers oficiais da página do jogo na Steam. */
async function steamMidias(nome) {
  const appid = await steamAppId(nome);
  if (!appid) return [];
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=portuguese`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const d = (await r.json())?.[appid]?.data;
  if (!d) return [];
  const lista = [];
  // Trailers oficiais: arquivo direto (mp4/webm) ou streaming HLS (.m3u8), que o Compilador baixa com o ffmpeg
  for (const m of d.movies || []) {
    const videoUrl = m.mp4?.max || m.mp4?.['480'] || m.webm?.max || m.webm?.['480'] || m.hls_h264 || null;
    if (!videoUrl) continue;
    lista.push({ id: `sv${m.id}`, videoUrl, imageUrl: m.thumbnail || null, conferir: m.thumbnail || null, trailer: true, credito: null, jogo: d.name });
  }
  for (const s of d.screenshots || []) {
    if (!s.path_full) continue;
    lista.push({ id: `ss${appid}_${s.id}`, imageUrl: s.path_full, conferir: s.path_thumbnail || s.path_full, credito: null, jogo: d.name });
  }
  return lista;
}

// Cache por rodada (várias cenas do mesmo jogo não buscam de novo)
const cache = new Map();

async function midiasDoJogo(nome) {
  const chave = nome.toLowerCase();
  if (cache.has(chave)) return cache.get(chave);
  const promessa = (async () => {
    const [igdb, steam] = await Promise.all([igdbImagens(nome).catch(() => []), steamMidias(nome).catch(() => [])]);
    // Fotos do IGDB e da Steam intercaladas
    const videos = steam.filter((m) => m.videoUrl);
    const fotos = [];
    const fs = steam.filter((m) => !m.videoUrl);
    for (let i = 0; i < Math.max(igdb.length, fs.length); i++) {
      if (igdb[i]) fotos.push(igdb[i]);
      if (fs[i]) fotos.push(fs[i]);
    }
    return { videos, fotos };
  })();
  cache.set(chave, promessa);
  return promessa;
}

/**
 * Mídia oficial para uma cena "@ jogo: Nome". Pula as que já foram usadas no vídeo.
 * Quando todas já foram usadas (muitas cenas do mesmo jogo), repete a menos recente.
 */
// Trechos do trailer: pula os primeiros segundos (logos e classificação etária) e cada cena pega outro pedaço
const TRECHOS = [12, 30, 48, 66, 84, 22, 40, 58, 76, 94];

export async function midiaDeJogo(busca, usados = new Set()) {
  const nome = nomeDoJogo(busca);
  if (!nome) return null;
  const { videos, fotos } = await midiasDoJogo(nome);
  if (!videos.length && !fotos.length) return null;
  // Quantas cenas deste jogo já saíram como vídeo e como foto (para alternar: vídeo, foto, vídeo...)
  const ja = [...usados].filter((id) => typeof id === 'string');
  const nVideos = videos.reduce((n, v) => n + ja.filter((id) => id.startsWith(`${v.id}_t`)).length, 0);
  const nFotos = fotos.filter((f) => usados.has(f.id)).length;
  const fotoLivre = fotos.find((f) => !usados.has(f.id));
  const querVideo = videos.length && (nVideos <= nFotos || !fotoLivre);
  if (querVideo) {
    // Próximo trecho ainda não usado, passando pelos trailers um de cada vez
    for (let k = 0; k < TRECHOS.length; k++) {
      for (const v of videos) {
        const id = `${v.id}_t${k}`;
        if (!usados.has(id)) return { ...v, id, videoInicio: TRECHOS[k], duracao: 600 };
      }
    }
  }
  if (fotoLivre) return fotoLivre;
  // Tudo usado: repete uma foto, com outro id para não brigar com a regra de "não repetir" do lote
  const m = fotos[Math.floor(Math.random() * fotos.length)] || videos[0];
  return { ...m, id: `${m.id}_r${Math.random().toString(36).slice(2, 6)}`, ...(m.videoUrl ? { videoInicio: 20, duracao: 600 } : {}) };
}

/** Imagem grande para a capa: primeira arte/screenshot oficial do jogo. */
export async function capaDeJogo(busca) {
  const { fotos } = await midiasDoJogo(nomeDoJogo(busca));
  return fotos[0]?.imageUrl || null;
}

/** Créditos que vão na descrição do vídeo (material oficial de divulgação). */
export function creditoGames(arquivos) {
  const jogos = [...new Set((arquivos || []).map((a) => a.jogo).filter(Boolean))];
  if (!jogos.length) return '';
  return `Imagens: material oficial de divulgação de ${jogos.join(', ')}. Todos os direitos pertencem às respectivas desenvolvedoras e publicadoras. Uso informativo.`;
}

// ───────────────────────── Voz do canal ─────────────────────────

/**
 * Voz do Próxima Fase: narrador jovem e animado, em português do Brasil, com cara de canal de games.
 * Escolhida UMA vez e guardada (youvideo_config/games.vozId), para todos os vídeos terem a mesma voz.
 * Ordem: GAMES_VOICE_ID na Vercel > voz já escolhida > busca na biblioteca da ElevenLabs > vozes da conta.
 * Devolve o voice_id ou null (aí usa a voz padrão).
 */
export async function vozDosGames() {
  if (process.env.GAMES_VOICE_ID) return process.env.GAMES_VOICE_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  let ref = null;
  try {
    const { getDb } = await import('./firebase-admin');
    ref = getDb().collection('youvideo_config').doc('games');
    const salvo = (await ref.get()).data();
    if (salvo?.vozId) return salvo.vozId;
  } catch {
    /* sem banco: escolhe de novo a cada vez */
  }
  const h = { 'xi-api-key': key };
  const texto = (v) => [v.descriptive, v.description, v.use_case, v.name, ...(Object.values(v.labels || {}))].join(' ').toLowerCase();
  const nota = (v) => {
    const t = texto(v);
    let n = 0;
    if (/energetic|excited|upbeat|enthusiastic|dynamic|hype|animad|energ/.test(t)) n += 4;
    if (/young|jovem|youthful/.test(t) || v.age === 'young') n += 3;
    if (/gam|social|youtube|entertainment|characters|commercial|advert/.test(t)) n += 2;
    if (/brazil|brasil|pt-br/.test(t) || v.locale === 'pt-BR') n += 3;
    if (/calm|soft|sleep|meditat|whisper|asmr|old|elderly|deep and slow/.test(t)) n -= 5;
    return n;
  };
  let escolhida = null;
  // 1) Biblioteca pública da ElevenLabs: vozes em português, as mais usadas primeiro
  try {
    for (const busca of ['energetic', 'young', '']) {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/shared-voices?page_size=50&language=pt&sort=cloned_by_count${busca ? `&search=${busca}` : ''}`,
        { headers: h }
      );
      if (!r.ok) break;
      const lista = ((await r.json()).voices || []).filter((v) => v.gender !== 'female' && nota(v) >= 5);
      lista.sort((a, b) => nota(b) - nota(a) || (b.cloned_by_count || 0) - (a.cloned_by_count || 0));
      const v = lista[0];
      if (v?.public_owner_id && v?.voice_id) {
        const add = await fetch(`https://api.elevenlabs.io/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, {
          method: 'POST',
          headers: { ...h, 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: `Próxima Fase — ${v.name}`.slice(0, 60) }),
        });
        if (add.ok) {
          escolhida = (await add.json()).voice_id || v.voice_id;
          break;
        }
      }
    }
  } catch {
    /* tenta as vozes da conta */
  }
  // 2) Vozes que já estão na conta
  if (!escolhida) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: h });
      if (r.ok) {
        const vozes = ((await r.json()).voices || []).filter((v) => v.labels?.gender !== 'female');
        vozes.sort((a, b) => nota(b) - nota(a));
        if (vozes[0] && nota(vozes[0]) >= 3) escolhida = vozes[0].voice_id;
      }
    } catch {
      /* fica a voz padrão */
    }
  }
  if (escolhida && ref) await ref.set({ vozId: escolhida, escolhidaEm: new Date().toISOString() }, { merge: true }).catch(() => {});
  return escolhida;
}

// ───────────────────────── Foto oficial direta (notícias) ─────────────────────────
// "@ imagem: https://..." = foto que veio na própria notícia de um blog oficial (PlayStation, Xbox, Steam).
export const ehImagemDireta = (b) => /^imagem:\s*https:\/\//i.test(String(b || '').trim());
export function midiaImagemDireta(busca) {
  const url = String(busca || '').replace(/^imagem:\s*/i, '').trim();
  if (!/^https:\/\//i.test(url)) return null;
  let h = 0;
  for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { id: `im${h.toString(36)}`, imageUrl: url, conferir: url, credito: null };
}
