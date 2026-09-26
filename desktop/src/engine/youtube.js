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
async function publicar({ credenciais, refreshToken, redirectOriginal, arquivo, titulo, descricao, tags, privacidade, miniatura, categoria, agendarPara, onProgresso }) {
  const auth = cliente(credenciais, redirectOriginal || REDIRECT);
  auth.setCredentials({ refresh_token: refreshToken });
  const yt = google.youtube({ version: 'v3', auth });
  const tamanho = fs.statSync(arquivo).size;

  const status = { privacyStatus: privacidade || 'private', selfDeclaredMadeForKids: false };
  if (agendarPara) {
    status.privacyStatus = 'private';
    status.publishAt = new Date(agendarPara).toISOString();
  }

  const r = await yt.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: String(titulo || 'Compilação').slice(0, 100),
          description: descricao || '',
          tags: (tags || []).slice(0, 30),
          categoryId: categoria || '10', // Música
        },
        status,
      },
      media: { body: fs.createReadStream(arquivo) },
    },
    { onUploadProgress: (e) => onProgresso && onProgresso(Math.min(1, e.bytesRead / tamanho)) }
  );
  const id = r.data.id;

  if (miniatura && fs.existsSync(miniatura)) {
    try {
      await yt.thumbnails.set({ videoId: id, media: { body: fs.createReadStream(miniatura) } });
    } catch {
      // Canal sem verificação de telefone não aceita miniatura personalizada — segue sem ela
    }
  }
  return { id, url: `https://youtu.be/${id}` };
}

module.exports = { autorizarCanal, canalPorToken, publicar, montarDescricao, REDIRECT };
