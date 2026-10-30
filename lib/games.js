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
  // Trailers: só arquivo direto (mp4/webm); a Steam pode mandar só streaming (HLS/DASH), aí fica só com as fotos
  for (const m of d.movies || []) {
    const videoUrl = m.mp4?.max || m.mp4?.['480'] || m.webm?.max || m.webm?.['480'] || null;
    if (!videoUrl) continue;
    lista.push({ id: `sv${m.id}`, videoUrl, imageUrl: m.thumbnail || null, conferir: m.thumbnail || null, duracao: null, credito: null, jogo: d.name });
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
    // Fotos do IGDB e da Steam intercaladas; o trailer da Steam entra a cada 3 cenas (movimento sem cansar)
    const videos = steam.filter((m) => m.videoUrl);
    const fotos = [];
    const fs = steam.filter((m) => !m.videoUrl);
    for (let i = 0; i < Math.max(igdb.length, fs.length); i++) {
      if (igdb[i]) fotos.push(igdb[i]);
      if (fs[i]) fotos.push(fs[i]);
    }
    const ordem = [];
    let v = 0;
    fotos.forEach((f, i) => {
      if (i % 3 === 1 && videos[v]) ordem.push(videos[v++]);
      ordem.push(f);
    });
    while (videos[v]) ordem.push(videos[v++]);
    return ordem;
  })();
  cache.set(chave, promessa);
  return promessa;
}

/**
 * Mídia oficial para uma cena "@ jogo: Nome". Pula as que já foram usadas no vídeo.
 * Quando todas já foram usadas (muitas cenas do mesmo jogo), repete a menos recente.
 */
export async function midiaDeJogo(busca, usados = new Set()) {
  const nome = nomeDoJogo(busca);
  if (!nome) return null;
  const lista = await midiasDoJogo(nome);
  if (!lista.length) return null;
  const livre = lista.find((m) => !usados.has(m.id));
  if (livre) return livre;
  // Tudo usado: repete, com outro id para não brigar com a regra de "não repetir" do lote
  const m = lista[Math.floor(Math.random() * lista.length)];
  return { ...m, id: `${m.id}_r${Math.random().toString(36).slice(2, 6)}` };
}

/** Imagem grande para a capa: primeira arte/screenshot oficial do jogo. */
export async function capaDeJogo(busca) {
  const lista = await midiasDoJogo(nomeDoJogo(busca));
  return lista.find((m) => !m.videoUrl)?.imageUrl || null;
}

/** Créditos que vão na descrição do vídeo (material oficial de divulgação). */
export function creditoGames(arquivos) {
  const jogos = [...new Set((arquivos || []).map((a) => a.jogo).filter(Boolean))];
  if (!jogos.length) return '';
  return `Imagens: material oficial de divulgação de ${jogos.join(', ')}. Todos os direitos pertencem às respectivas desenvolvedoras e publicadoras. Uso informativo.`;
}
