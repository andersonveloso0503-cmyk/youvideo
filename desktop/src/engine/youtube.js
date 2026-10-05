// Contas do YouTube: autoriza cada canal uma vez (pelo navegador) e publica direto.
const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');

const PORTA_CALLBACK = 53682;
const REDIRECT = `http://127.0.0.1:${PORTA_CALLBACK}/callback`;
const ESCOPOS = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

function cliente({ clientId, clientSecret }, redirect = REDIRECT) {
  if (!clientId || !clientSecret) throw new Error('Cadastre o Client ID e o Client Secret do Google em Configurações.');
  return new google.auth.OAuth2(clientId, clientSecret, redirect);
}

async function dadosDoCanal(auth) {
  const yt = google.youtube({ version: 'v3', auth });
  const r = await yt.channels.list({ part: ['snippet'], mine: true });
  const c = r.data.items?.[0];
  if (!c) throw new Error('Essa conta Google não tem canal do YouTube.');
  return {
    id: c.id,
    titulo: c.snippet.title,
    thumb: c.snippet.thumbnails?.default?.url || null,
  };
}

/** Abre o navegador para autorizar um canal e devolve { canal, refreshToken }. */
function autorizarCanal(credenciais, abrirNoNavegador) {
  const auth = cliente(credenciais);
  return new Promise((resolve, reject) => {
    let finalizado = false;
    const servidor = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/callback')) {
        res.writeHead(404);
        return res.end();
      }
      const url = new URL(req.url, REDIRECT);
      const code = url.searchParams.get('code');
      const erro = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (erro || !code) {
        res.end(`<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px"><h2>Autorização cancelada</h2><p>${erro || ''}</p></body>`);
        fechar();
        return reject(new Error('Autorização cancelada.'));
      }
      try {
        const { tokens } = await auth.getToken(code);
        auth.setCredentials(tokens);
        const canal = await dadosDoCanal(auth);
        if (!tokens.refresh_token) throw new Error('O Google não devolveu o refresh token. Remova o acesso em myaccount.google.com/permissions e tente de novo.');
        res.end(`<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px"><h2>✅ Canal "${canal.titulo}" conectado</h2><p>Pode fechar esta aba e voltar ao Youvideo Compilador.</p></body>`);
        fechar();
        resolve({ canal, refreshToken: tokens.refresh_token });
      } catch (e) {
        res.end(`<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px"><h2>Erro</h2><p>${e.message}</p></body>`);
        fechar();
        reject(e);
      }
    });
    const tempo = setTimeout(() => {
      fechar();
      reject(new Error('Tempo esgotado esperando a autorização (5 min).'));
    }, 5 * 60 * 1000);
    function fechar() {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(tempo);
      servidor.close();
    }
    servidor.on('error', (e) => reject(new Error(`Não consegui abrir a porta ${PORTA_CALLBACK}: ${e.message}`)));
    servidor.listen(PORTA_CALLBACK, '127.0.0.1', () => {
      const link = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent select_account', scope: ESCOPOS });
      abrirNoNavegador(link);
    });
  });
}

/** Conecta um canal colando um refresh token que já existe (ex.: o da Vercel). */
async function canalPorToken(credenciais, refreshToken, redirectOriginal) {
  const auth = cliente(credenciais, redirectOriginal || REDIRECT);
  auth.setCredentials({ refresh_token: refreshToken });
  return dadosDoCanal(auth);
}

function montarDescricao({ descricao, timeline, incluirTracklist, curto, tags }) {
  const partes = [];
  if (descricao) partes.push(descricao.trim());
  if (incluirTracklist && timeline?.length > 1) {
    const fmt = (s) => {
      s = Math.floor(s);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return (h ? `${h}:${String(m).padStart(2, '0')}` : `${String(m).padStart(2, '0')}`) + `:${String(sec).padStart(2, '0')}`;
    };
    partes.push('🎵 Músicas:\n' + timeline.map((m) => `${fmt(m.inicio)} ${m.titulo}`).join('\n'));
  }
  const hashtags = (tags || []).slice(0, 5).map((t) => '#' + String(t).replace(/[^\p{L}\p{N}]/gu, '')).filter((t) => t.length > 1);
  if (curto && !hashtags.some((h) => h.toLowerCase() === '#shorts')) hashtags.unshift('#Shorts');
  if (hashtags.length) partes.push(hashtags.join(' '));
  let final = partes.join('\n\n');
  if (final.length > 4900) final = final.slice(0, 4900) + '\n(...)';
  return final;
}

/** Envia o vídeo para o canal. Devolve { id, url }. */
/**
 * Tags no limite do YouTube: 500 caracteres no total, contando a vírgula entre elas e as
 * aspas que ele põe em tag com espaço. Passou disso ele recusa com "invalid video keywords".
 */
function limparTags(tags) {
  const lista = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const vistas = new Set();
  const saida = [];
  let total = 0;
  for (const bruta of lista) {
    const t = String(bruta || '').replace(/[<>"#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (t.length < 2 || vistas.has(t.toLowerCase())) continue;
    const custo = t.length + (t.includes(' ') ? 2 : 0) + (saida.length ? 1 : 0);
    if (total + custo > 450) continue; // folga abaixo dos 500
    vistas.add(t.toLowerCase());
    saida.push(t);
    total += custo;
  }
  return saida;
}

// O YouTube recusa < e > no título e na descrição
const semSinais = (t) => String(t || '').replace(/[<>]/g, '');

/**
 * Categoria do vídeo no YouTube: 10 = Música; 22 = Pessoas e blogs (histórias bíblicas, orações, vídeos falados).
 * Vale, nesta ordem: a categoria do próprio envio, o tipo do vídeo na Biblioteca e, por fim, o nome do canal.
 */
const CATEGORIA_MUSICA = '10';
const CATEGORIA_FALADO = '22';
const TIPOS_MUSICA = ['musicas', 'medleys', 'cover', 'compilacoes'];
const TIPOS_FALADO = ['historias', 'series', 'cortes', 'empresa', 'oracao'];
const canalFalado = (titulo) => /jesus|cristo|b[ií]bli|\bdeus\b|ora[cç][aã]o|evangel|hist[oó]rias/i.test(String(titulo || ''));
function categoriaDoVideo({ categoria, tipo, canalTitulo } = {}) {
  if (/^\d+$/.test(String(categoria || ''))) return String(categoria);
  if (TIPOS_MUSICA.includes(tipo)) return CATEGORIA_MUSICA;
  if (TIPOS_FALADO.includes(tipo)) return CATEGORIA_FALADO;
  return canalFalado(canalTitulo) ? CATEGORIA_FALADO : CATEGORIA_MUSICA;
}

async function publicar({ credenciais, refreshToken, redirectOriginal, arquivo, titulo, descricao, tags, privacidade, miniatura, categoria, idioma, agendarPara, onProgresso, conteudoIa = false }) {
  const auth = cliente(credenciais, redirectOriginal || REDIRECT);
  auth.setCredentials({ refresh_token: refreshToken });
  const yt = google.youtube({ version: 'v3', auth });
  const tamanho = fs.statSync(arquivo).size;

  // Canal sem verificação por telefone só aceita vídeos de até 15 min: avisa antes de subir
  const { probe } = require('./ffmpeg');
  const duracao = (await probe(arquivo).catch(() => ({ duracao: 0 }))).duracao;
  if (duracao > 15 * 60) {
    const c = await yt.channels.list({ part: ['status', 'snippet'], mine: true }).catch(() => null);
    const longos = c?.data?.items?.[0]?.status?.longUploadsStatus;
    if (longos && longos !== 'allowed') {
      const nome = c.data.items[0].snippet?.title || 'o canal';
      throw new Error(
        `O YouTube ainda não deixa "${nome}" subir vídeos com mais de 15 min. Verifique o canal por SMS em youtube.com/verify (logado nesse canal) e depois clique em ↻ Tentar de novo.`
      );
    }
  }

  // conteudoIa: marca "conteúdo alterado ou sintético" (feito com IA), como pede a regra do YouTube
  const status = { privacyStatus: privacidade || 'private', selfDeclaredMadeForKids: false, ...(conteudoIa ? { containsSyntheticMedia: true } : {}) };
  if (agendarPara) {
    status.privacyStatus = 'private';
    status.publishAt = new Date(agendarPara).toISOString();
  }

  const inserir = (comIdioma) =>
    yt.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: semSinais(titulo).replace(/\s+/g, ' ').trim().slice(0, 100) || 'Compilação',
            description: semSinais(descricao).slice(0, 4900),
            tags: limparTags(tags),
            categoryId: categoria || CATEGORIA_MUSICA,
            // idioma do vídeo: ajuda o YouTube a mostrar para quem fala a língua (só vídeos falados; música pode ser em outra língua)
            ...(comIdioma && idioma ? { defaultLanguage: idioma, defaultAudioLanguage: idioma } : {}),
          },
          status,
        },
        media: { body: fs.createReadStream(arquivo) },
      },
      { onUploadProgress: (e) => onProgresso && onProgresso(Math.min(1, e.bytesRead / tamanho)) }
    );
  let r;
  try {
    r = await inserir(true);
  } catch (e) {
    // Se o YouTube recusar o idioma, o vídeo sobe mesmo assim (sem o idioma marcado)
    if (!idioma || !/language/i.test(String(e?.errors?.[0]?.reason || '') + String(e?.message || ''))) throw e;
    r = await inserir(false);
  }
  const id = r.data.id;

  let miniaturaErro = null;
  if (miniatura && fs.existsSync(miniatura)) {
    try {
      await yt.thumbnails.set({ videoId: id, media: { mimeType: 'image/jpeg', body: fs.createReadStream(miniatura) } });
    } catch (e) {
      // Canal sem verificação de telefone não aceita miniatura personalizada — o vídeo sobe mesmo assim
      miniaturaErro = /verif|permission|forbidden/i.test(e.message)
        ? 'Capa não enviada: o canal precisa estar verificado (youtube.com/verify)'
        : `Capa não enviada: ${e.message}`;
    }
  }
  return { id, url: `https://youtu.be/${id}`, miniaturaErro };
}

/** Data do último vídeo agendado (ainda não publicado) do canal, ou null. */
async function ultimoAgendado({ credenciais, refreshToken, redirectOriginal }) {
  const auth = cliente(credenciais, redirectOriginal || REDIRECT);
  auth.setCredentials({ refresh_token: refreshToken });
  const yt = google.youtube({ version: 'v3', auth });
  const c = await yt.channels.list({ part: ['contentDetails'], mine: true });
  const uploads = c.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return null;
  const itens = await yt.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50 });
  const ids = (itens.data.items || []).map((i) => i.contentDetails.videoId).filter(Boolean);
  if (!ids.length) return null;
  const v = await yt.videos.list({ part: ['status'], id: ids });
  const agora = Date.now();
  const datas = (v.data.items || [])
    .map((x) => x.status?.publishAt)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => t > agora);
  return datas.length ? new Date(Math.max(...datas)).toISOString() : null;
}

// ───────── Arrumar os vídeos que já estão no canal ─────────

/** Por que um título é fraco (texto curto para mostrar na tela), ou '' se está bom. */
function tituloFraco(titulo) {
  const t = String(titulo || '').replace(/\s*#[\p{L}\p{N}_]+/gu, '').trim();
  if (!t) return 'Sem título';
  if (/^\d{1,2} de [\p{L}]+ de \d{4}$/iu.test(t)) return 'Só a data, sem dizer do que é o vídeo';
  if (/^(v[ií]deo|short|compila[cç][aã]o)\b/i.test(t) && t.length < 25) return 'Título genérico';
  if (/^(descubra|veja|conhe[cç]a|saiba|entenda)\s+(como|o que|por ?que|quem|a história)/i.test(t)) return 'Uma frase inteira no lugar do título';
  if (t.length > 78 && /[.?!]$/.test(t) && !/[|—–:]/.test(t)) return 'Uma frase inteira no lugar do título';
  if (/^por ?que\b/i.test(t)) return 'Começa com "Por Que", igual a vários outros vídeos';
  return '';
}

const segundosIso = (iso) => {
  const m = String(iso || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0) : 0;
};

function youtubeDoCanal({ credenciais, refreshToken, redirectOriginal }) {
  const auth = cliente(credenciais, redirectOriginal || REDIRECT);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: 'v3', auth });
}

/**
 * Lê os vídeos do canal e diz o que há para arrumar em cada um. NÃO muda nada no YouTube.
 * Devolve { canal, categoriaCerta, idiomaCerto, videos: [{ id, titulo, descricao, categoria, idioma, motivoTitulo, arrumarFicha, ... }] }.
 */
async function conferirCanal({ credenciais, refreshToken, redirectOriginal, maximo = 300 }) {
  const yt = youtubeDoCanal({ credenciais, refreshToken, redirectOriginal });
  const c = await yt.channels.list({ part: ['contentDetails', 'snippet'], mine: true });
  const canal = c.data.items?.[0];
  const uploads = canal?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('Não achei os vídeos deste canal.');
  const canalTitulo = canal.snippet?.title || '';
  const falado = categoriaDoVideo({ canalTitulo }) === CATEGORIA_FALADO;
  const categoriaCerta = falado ? CATEGORIA_FALADO : CATEGORIA_MUSICA;
  const idiomaCerto = falado ? 'pt-BR' : '';

  const ids = [];
  let pageToken;
  do {
    const r = await yt.playlistItems.list({ part: ['contentDetails'], playlistId: uploads, maxResults: 50, pageToken });
    ids.push(...(r.data.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean));
    pageToken = r.data.nextPageToken;
  } while (pageToken && ids.length < maximo);

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt.videos.list({ part: ['snippet', 'status', 'contentDetails'], id: ids.slice(i, i + 50) });
    for (const x of v.data.items || []) {
      const sn = x.snippet || {};
      const categoriaErrada = String(sn.categoryId || '') !== categoriaCerta;
      const semIdioma = !!idiomaCerto && (!sn.defaultLanguage || !sn.defaultAudioLanguage);
      videos.push({
        id: x.id,
        titulo: sn.title || '',
        descricao: String(sn.description || '').slice(0, 600),
        categoria: String(sn.categoryId || ''),
        idioma: sn.defaultAudioLanguage || sn.defaultLanguage || '',
        thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || null,
        privacidade: x.status?.privacyStatus || '',
        agendadoPara: x.status?.publishAt || null,
        publicadoEm: sn.publishedAt || null,
        duracaoSeg: segundosIso(x.contentDetails?.duration),
        // Só canal de vídeo falado tem título revisado (em canal de música o título segue outra regra)
        motivoTitulo: falado ? tituloFraco(sn.title) : '',
        arrumarFicha: categoriaErrada || semIdioma,
        categoriaErrada,
        semIdioma,
      });
    }
  }
  return { canal: canalTitulo, falado, categoriaCerta, idiomaCerto, videos };
}

/**
 * Aplica os consertos. itens = [{ id, titulo? }]: troca categoria e idioma (e o título, se vier).
 * Sempre relê o vídeo antes de gravar, para não apagar descrição nem tags.
 * Devolve { feitos: [id], falhas: [{ id, erro }], parou: texto|null }.
 */
async function corrigirVideos({ credenciais, refreshToken, redirectOriginal, itens, categoria, idioma, onProgresso }) {
  const yt = youtubeDoCanal({ credenciais, refreshToken, redirectOriginal });
  const atuais = {};
  const ids = itens.map((i) => i.id);
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt.videos.list({ part: ['snippet'], id: ids.slice(i, i + 50) });
    for (const x of v.data.items || []) atuais[x.id] = x.snippet;
  }
  const feitos = [];
  const falhas = [];
  let parou = null;
  for (const [n, it] of itens.entries()) {
    const sn = atuais[it.id];
    if (!sn) {
      falhas.push({ id: it.id, erro: 'Vídeo não encontrado no canal' });
      continue;
    }
    try {
      const novoTitulo = semSinais(it.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      const lingua = idioma || sn.defaultLanguage || '';
      const linguaAudio = idioma || sn.defaultAudioLanguage || '';
      const gravar = (comIdiomaNovo) =>
        yt.videos.update({
          part: ['snippet'],
          requestBody: {
            id: it.id,
            snippet: {
              title: novoTitulo || sn.title,
              description: sn.description || '',
              tags: sn.tags || [],
              categoryId: categoria || sn.categoryId,
              ...((comIdiomaNovo ? lingua : sn.defaultLanguage) ? { defaultLanguage: comIdiomaNovo ? lingua : sn.defaultLanguage } : {}),
              ...((comIdiomaNovo ? linguaAudio : sn.defaultAudioLanguage) ? { defaultAudioLanguage: comIdiomaNovo ? linguaAudio : sn.defaultAudioLanguage } : {}),
            },
          },
        });
      try {
        await gravar(true);
      } catch (e) {
        // O YouTube recusou o idioma: grava o resto (categoria e título) sem mexer no idioma
        if (!idioma || !/language/i.test(String(e?.errors?.[0]?.reason || '') + String(e?.message || ''))) throw e;
        await gravar(false);
      }
      feitos.push(it.id);
    } catch (e) {
      const msg = String(e?.errors?.[0]?.reason || e?.message || e);
      if (/quota|rateLimit|dailyLimit/i.test(msg)) {
        parou = 'O YouTube atingiu o limite de alterações de hoje. Clique em "Conferir" de novo amanhã para terminar o que faltou.';
        break;
      }
      falhas.push({ id: it.id, erro: msg.slice(0, 160) });
    }
    if (onProgresso) onProgresso((n + 1) / itens.length);
  }
  return { feitos, falhas, parou };
}

module.exports = {
  limparTags, autorizarCanal, canalPorToken, publicar, montarDescricao, ultimoAgendado, REDIRECT,
  categoriaDoVideo, tituloFraco, conferirCanal, corrigirVideos, CATEGORIA_MUSICA, CATEGORIA_FALADO };
