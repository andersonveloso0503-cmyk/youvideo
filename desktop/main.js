// Youvideo Compilador — processo principal (janela, arquivos, fila e YouTube)
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, safeStorage, powerSaveBlocker, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Store } = require('./src/store');
const { Fila } = require('./src/engine/fila');
const { probe, rodar, detectarEncoder } = require('./src/engine/ffmpeg');
const YT = require('./src/engine/youtube');
const IA = require('./src/engine/ia');
const Central = require('./src/engine/central');
const Sync = require('./src/sync');

// Depois de mudar chaves ou canais, guarda uma cópia criptografada na nuvem (se a Central estiver ligada)
let tSync = null;
function sincronizarDepois() {
  clearTimeout(tSync);
  tSync = setTimeout(() => Sync.enviar(store).then((r) => r.ok && enviar('sync:feito', r.em)).catch(() => {}), 1500);
}
const { gerarMiniatura, capaAoLado } = require('./src/engine/miniatura');
const { ehImagem } = require('./src/engine/render');

const { EXT_IMAGEM } = require('./src/engine/render');

const EXT_AUDIO = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aif', 'aiff', 'amr', 'ac3', 'mka', 'm4b', 'mpga', 'wv', 'ape', 'mp4', 'webm', 'mkv', 'mov'];
// Qualquer imagem: o que o ffmpeg não abrir direto (ex.: SVG) é convertido pela própria tela do app
const EXT_IMG = [...EXT_IMAGEM.map((e) => e.slice(1)), 'gif', 'svg', 'heic', 'heif'];
const EXT_VIDEO = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'wmv', 'flv', '3gp', 'mpg', 'mpeg', 'ts', 'mts'];
const EXT_FUNDO = [...EXT_IMG, ...EXT_VIDEO];
const REPO = 'andersonveloso0503-cmyk/youvideo';

let janela;
let store;
let fila;
let bloqueioSono = null;

// Pasta de dados alternativa (usada só nos testes automáticos)
if (process.env.COMPILADOR_DADOS) app.setPath('userData', process.env.COMPILADOR_DADOS);

if (!app.requestSingleInstanceLock()) app.quit();

function fontsDir() {
  const p = path.join(__dirname, 'assets', 'fonts');
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

// ---------- Aba "Criar": as ferramentas do Youvideo abertas dentro do app ----------
let vistaCriar = null;
let vistaNoAr = false;

function baseYouvideo() {
  return String(store.ler().centralUrl || 'https://youvideors2.vercel.app').replace(/\/+$/, '');
}

function criarVista() {
  if (vistaCriar) return vistaCriar;
  const sessao = session.fromPartition('persist:youvideo');
  // Downloads feitos nas telas do Youvideo vão para a pasta de vídeos escolhida no app
  sessao.on('will-download', (_e, item) => {
    const pasta = store.ler().ultimoProjeto?.saida?.pasta || app.getPath('videos');
    let destino = path.join(pasta, item.getFilename());
    for (let i = 2; fs.existsSync(destino); i++) destino = path.join(pasta, item.getFilename().replace(/(\.\w+)?$/, ` (${i})$1`));
    item.setSavePath(destino);
    enviar('criar:download', { estado: 'baixando', nome: item.getFilename() });
    item.on('updated', () => {
      const t = item.getTotalBytes();
      if (t) enviar('criar:download', { estado: 'baixando', nome: item.getFilename(), x: item.getReceivedBytes() / t });
    });
    item.once('done', (_ev, estado) => enviar('criar:download', { estado, nome: item.getFilename(), arquivo: destino }));
  });
  vistaCriar = new WebContentsView({ webPreferences: { session: sessao, contextIsolation: true, sandbox: true } });
  vistaCriar.setBackgroundColor('#15130f');
  const wc = vistaCriar.webContents;
  const mesmoSite = (url) => {
    try {
      return new URL(url).origin === new URL(baseYouvideo()).origin;
    } catch {
      return false;
    }
  };
  // Links do próprio Youvideo abrem aqui dentro; o resto (YouTube, Google...) no navegador
  wc.setWindowOpenHandler(({ url }) => {
    if (mesmoSite(url) && !/\/api\/(auth|download)/.test(url)) wc.loadURL(url);
    else if (/^https?:\/\//.test(url)) {
      if (/\/api\/download/.test(url)) wc.downloadURL(url);
      else shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  const avisarNavegacao = () =>
    enviar('criar:navegou', { url: wc.getURL(), titulo: wc.getTitle(), voltar: wc.navigationHistory.canGoBack() });
  wc.on('did-navigate', avisarNavegacao);
  wc.on('did-navigate-in-page', avisarNavegacao);
  wc.on('page-title-updated', avisarNavegacao);
  wc.on('did-start-loading', () => enviar('criar:carregando', true));
  wc.on('did-stop-loading', () => enviar('criar:carregando', false));
  wc.on('did-fail-load', (_e, codigo, desc, url, principal) => {
    if (principal && codigo !== -3) enviar('criar:erro', `Não consegui abrir o Youvideo (${desc}). Confira a internet.`);
  });
  return vistaCriar;
}

function mostrarVista(visivel) {
  if (!vistaCriar || !janela) return;
  if (visivel && !vistaNoAr) {
    janela.contentView.addChildView(vistaCriar);
    vistaNoAr = true;
  } else if (!visivel && vistaNoAr) {
    janela.contentView.removeChildView(vistaCriar);
    vistaNoAr = false;
  }
}

function criarJanela() {
  nativeTheme.themeSource = 'dark';
  janela = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d0d12',
    title: 'Youvideo Compilador',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  janela.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.COMPILADOR_CAPTURA) {
    // Teste automático: tira um print da tela e fecha
    janela.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.COMPILADOR_JS) await janela.webContents.executeJavaScript(process.env.COMPILADOR_JS).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      const img = await janela.webContents.capturePage();
      fs.writeFileSync(process.env.COMPILADOR_CAPTURA, img.toPNG());
      if (vistaCriar && vistaNoAr) fs.writeFileSync(process.env.COMPILADOR_CAPTURA + '.vista.png', (await vistaCriar.webContents.capturePage()).toPNG());
      app.exit(0);
    }, 2500));
  }
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.on('close', (e) => {
    const ativos = fila.lista().filter((j) => !['aguardando', 'concluido', 'erro', 'cancelado', 'interrompido'].includes(j.status));
    if (!ativos.length) return;
    const r = dialog.showMessageBoxSync(janela, {
      type: 'warning',
      buttons: ['Continuar gerando', 'Fechar mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      title: 'Vídeo sendo gerado',
      message: 'Tem vídeo sendo gerado agora. Se fechar, ele será interrompido.',
    });
    if (r === 0) e.preventDefault();
  });
}

function enviar(canal, dados) {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, dados);
}

function listarPasta(pasta, exts) {
  const saida = [];
  const andar = (p, nivel) => {
    for (const nome of fs.readdirSync(p)) {
      const c = path.join(p, nome);
      let st;
      try {
        st = fs.statSync(c);
      } catch {
        continue;
      }
      if (st.isDirectory() && nivel < 2) andar(c, nivel + 1);
      else if (exts.includes(path.extname(nome).slice(1).toLowerCase())) saida.push(c);
    }
  };
  andar(pasta, 0);
  return saida.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

async function infoMusicas(caminhos) {
  const res = [];
  const fila2 = [...caminhos];
  const trabalhar = async () => {
    while (fila2.length) {
      const c = fila2.shift();
      try {
        const i = await probe(c);
        if (!i.temAudio) continue;
        const nomeArquivo = path.basename(c, path.extname(c));
        res.push({
          arquivo: c,
          titulo: i.titulo ? (i.artista ? `${i.artista} - ${i.titulo}` : i.titulo) : nomeArquivo,
          nomeArquivo,
          duracao: i.duracao,
        });
      } catch {}
    }
  };
  await Promise.all([1, 2, 3, 4].map(trabalhar));
  const ordem = new Map(caminhos.map((c, i) => [c, i]));
  return res.sort((a, b) => ordem.get(a.arquivo) - ordem.get(b.arquivo));
}

// Contador de envios do dia. O limite do YouTube (100/dia) renova à meia-noite do horário do Pacífico.
function diaPacifico() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}
function enviosHoje() {
  const e = store.ler().envios || {};
  return e.dia === diaPacifico() ? e.n || 0 : 0;
}
function registrarEnvio() {
  store.salvar({ envios: { dia: diaPacifico(), n: enviosHoje() + 1 } });
}
function horaRenovacao() {
  // Próxima meia-noite do Pacífico, no horário do PC
  const agora = new Date();
  for (let h = 1; h <= 25; h++) {
    const t = new Date(Math.ceil(agora.getTime() / 3600e3) * 3600e3 + (h - 1) * 3600e3);
    const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit' }).format(t));
    if (hora === 0 || hora === 24) return t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return '';
}

function atualizarBloqueioSono(jobs) {
  const rodando = jobs.some((j) => ['separando', 'legenda', 'audio', 'fundos', 'renderizando', 'publicando'].includes(j.status));
  if (rodando && bloqueioSono === null) bloqueioSono = powerSaveBlocker.start('prevent-app-suspension');
  if (!rodando && bloqueioSono !== null) {
    powerSaveBlocker.stop(bloqueioSono);
    bloqueioSono = null;
  }
}

// Uso de CPU para o indicador no topo
let ultimoCpu = os.cpus();
setInterval(() => {
  const agora = os.cpus();
  let ocioso = 0;
  let total = 0;
  agora.forEach((c, i) => {
    const a = ultimoCpu[i]?.times || c.times;
    const t = c.times;
    const dt = Object.keys(t).reduce((s, k) => s + (t[k] - a[k]), 0);
    ocioso += t.idle - a.idle;
    total += dt;
  });
  ultimoCpu = agora;
  enviar('sistema:cpu', total ? Math.round((1 - ocioso / total) * 100) : 0);
}, 2000);

app.whenReady().then(() => {
  const dirDados = app.getPath('userData');
  store = new Store(dirDados, safeStorage);
  fila = new Fila({
    dirDados,
    fontsDir: fontsDir(),
    obterConfig: () => store.ler(),
    obterCanal: (id) => store.canal(id),
    registrarEnvio: () => registrarEnvio(),
  });
  fila.proximo(); // retoma o que ficou aguardando na última vez
  fila.on('mudou', (jobs) => {
    enviar('fila:mudou', jobs);
    atualizarBloqueioSono(jobs);
  });

  // ---------- Configurações ----------
  ipcMain.handle('config:ler', () => store.paraTela());
  ipcMain.handle('config:salvar', (_e, novo) => {
    const limpo = JSON.parse(JSON.stringify(novo || {}));
    const mascarado = (v) => typeof v === 'string' && v.startsWith('••••');
    for (const k of ['falKey', 'groqKey', 'centralToken']) if (mascarado(limpo[k]) || limpo[k] === undefined) delete limpo[k];
    if (limpo.google && mascarado(limpo.google.clientSecret)) delete limpo.google.clientSecret;
    store.salvar(limpo);
    if (['falKey', 'groqKey', 'google', 'modo', 'simultaneos', 'encoder', 'envioPrefs'].some((k) => k in limpo)) sincronizarDepois();
    return store.paraTela();
  });
  ipcMain.handle('config:salvarProjeto', (_e, projeto) => {
    store.salvar({ ultimoProjeto: projeto });
    return true;
  });
  ipcMain.handle('sistema:info', async () => ({
    versao: app.getVersion(),
    nucleos: os.cpus().length,
    encoder: await detectarEncoder(),
    redirect: YT.REDIRECT,
  }));

  // ---------- Arquivos ----------
  ipcMain.handle('dialogo:musicas', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Adicionar músicas',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Áudio', extensions: EXT_AUDIO }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    return r.canceled ? [] : infoMusicas(r.filePaths);
  });
  ipcMain.handle('dialogo:pastaMusicas', async () => {
    const r = await dialog.showOpenDialog(janela, { title: 'Escolher pasta de músicas', properties: ['openDirectory'] });
    if (r.canceled) return [];
    return infoMusicas(listarPasta(r.filePaths[0], EXT_AUDIO));
  });
  ipcMain.handle('midia:musicas', (_e, caminhos) => infoMusicas((caminhos || []).filter((c) => EXT_AUDIO.includes(path.extname(c).slice(1).toLowerCase()))));
  ipcMain.handle('dialogo:fundos', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Adicionar imagem ou vídeo de fundo',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Imagens e vídeos', extensions: EXT_FUNDO },
        { name: 'Imagens', extensions: EXT_IMG },
        { name: 'Vídeos', extensions: EXT_VIDEO },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialogo:pastaSaida', async () => {
    const r = await dialog.showOpenDialog(janela, { title: 'Pasta onde salvar os vídeos', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('abrir:pasta', (_e, arquivo) => {
    if (arquivo && fs.existsSync(arquivo)) shell.showItemInFolder(arquivo);
  });
  ipcMain.handle('abrir:link', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  // Confere se o ffmpeg consegue abrir cada fundo. O que ele não abrir, a tela converte para PNG.
  ipcMain.handle('midia:checarFundos', async (_e, caminhos) => {
    const saida = [];
    for (const c of caminhos || []) {
      try {
        // Tenta decodificar 1 quadro de verdade (o ffprobe às vezes "lê" formatos que o ffmpeg não desenha, como SVG)
        await rodar(['-i', c, '-frames:v', '1', '-f', 'null', '-']).promise;
        saida.push({ arquivo: c, ok: true });
      } catch {
        saida.push({ arquivo: c, ok: false });
      }
    }
    return saida;
  });
  ipcMain.handle('midia:salvarImagem', (_e, { original, bytes }) => {
    const pasta = path.join(app.getPath('userData'), 'cache', 'imagens');
    fs.mkdirSync(pasta, { recursive: true });
    const nome = `${path.basename(original, path.extname(original)).replace(/[^\w\- ]/g, '').slice(0, 60) || 'imagem'}_${Date.now().toString(36)}.png`;
    const destino = path.join(pasta, nome);
    fs.writeFileSync(destino, Buffer.from(bytes));
    return destino;
  });

  // ---------- Atualização automática ----------
  ipcMain.handle('app:verificarAtualizacao', async () => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { 'User-Agent': 'youvideo-compilador' } });
      if (!r.ok) return null;
      const lista = await r.json();
      const rel = lista.find((x) => String(x.tag_name).startsWith('compilador-v') && !x.draft);
      const exe = rel && rel.assets.find((a) => a.name.endsWith('.exe'));
      if (!rel || !exe) return null;
      const nova = rel.tag_name.replace('compilador-v', '');
      const comparar = (a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        return 0;
      };
      if (comparar(nova, app.getVersion()) <= 0) return null;
      return { versao: nova, url: exe.browser_download_url, tamanho: exe.size, notas: rel.body || '' };
    } catch {
      return null;
    }
  });
  ipcMain.handle('app:atualizar', async (_e, { url, tamanho }) => {
    if (!/^https:\/\/github\.com\/andersonveloso0503-cmyk\/youvideo\/releases\/download\//.test(url)) throw new Error('Link de atualização inválido.');
    const destino = path.join(os.tmpdir(), `Youvideo-Compilador-Setup-${Date.now()}.exe`);
    const r = await fetch(url, { headers: { 'User-Agent': 'youvideo-compilador' } });
    if (!r.ok || !r.body) throw new Error(`Não consegui baixar a atualização (${r.status}).`);
    const arquivo = fs.createWriteStream(destino);
    let baixado = 0;
    for await (const pedaco of r.body) {
      arquivo.write(pedaco);
      baixado += pedaco.length;
      enviar('app:progressoAtualizacao', tamanho ? baixado / tamanho : 0);
    }
    await new Promise((res) => arquivo.end(res));
    // Abre o instalador e fecha o app para ele poder substituir os arquivos
    require('child_process').spawn(destino, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.exit(0), 800);
    return true;
  });

  // ---------- Canais do YouTube ----------
  ipcMain.handle('canais:listar', () => store.canaisParaTela());
  ipcMain.handle('canais:autorizar', async () => {
    const cfg = store.ler();
    const r = await YT.autorizarCanal(cfg.google, (url) => shell.openExternal(url));
    store.salvarCanal({ ...r, redirect: YT.REDIRECT });
    sincronizarDepois();
    return store.canaisParaTela();
  });
  ipcMain.handle('canais:porToken', async (_e, { refreshToken }) => {
    const cfg = store.ler();
    const token = String(refreshToken || '').trim();
    if (!token) throw new Error('Cole o refresh token.');
    const redirect = cfg.google.redirectOriginal || YT.REDIRECT;
    const canal = await YT.canalPorToken(cfg.google, token, redirect);
    store.salvarCanal({ canal, refreshToken: token, redirect });
    sincronizarDepois();
    return store.canaisParaTela();
  });
  ipcMain.handle('canais:remover', (_e, id) => {
    store.removerCanal(id);
    sincronizarDepois();
    return store.canaisParaTela();
  });

  // ---------- Fila ----------
  ipcMain.handle('fila:listar', () => fila.lista());
  ipcMain.handle('fila:adicionar', (_e, projeto) => fila.adicionar(projeto).length);
  ipcMain.handle('fila:cancelar', (_e, id) => fila.cancelar(id));
  ipcMain.handle('fila:remover', (_e, id) => fila.remover(id));
  ipcMain.handle('fila:retentar', (_e, id) => fila.retentar(id));
  ipcMain.handle('fila:limpar', (_e, tudo) => fila.limpar(!!tudo));

  // ---------- Botão Inscrever (animação feita pela tela, vira um clipe com transparência) ----------
  const pastaBotao = (chave) => path.join(app.getPath('userData'), 'cache', 'botao', String(chave).replace(/[^\w-]/g, ''));
  ipcMain.handle('botao:existe', (_e, chave) => {
    const f = path.join(pastaBotao(chave), 'botao.mov');
    return fs.existsSync(f) ? f : null;
  });
  ipcMain.handle('botao:salvar', async (_e, { chave, quadros }) => {
    const pasta = pastaBotao(chave);
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta, { recursive: true });
    quadros.forEach((q, i) => fs.writeFileSync(path.join(pasta, `q${String(i).padStart(4, '0')}.png`), Buffer.from(q)));
    const saida = path.join(pasta, 'botao.mov');
    await rodar(['-framerate', '24', '-i', path.join(pasta, 'q%04d.png'), '-c:v', 'png', '-pix_fmt', 'rgba', saida]).promise;
    for (const f of fs.readdirSync(pasta)) if (f.endsWith('.png')) fs.rmSync(path.join(pasta, f), { force: true });
    return saida;
  });

  // ---------- Levar configurações para outro PC ----------
  ipcMain.handle('sync:enviar', () => Sync.enviar(store));
  ipcMain.handle('sync:puxar', async () => {
    const r = await Sync.puxar(store);
    return { ...r, config: store.paraTela(), canais: store.canaisParaTela() };
  });

  // ---------- Aba Criar ----------
  ipcMain.handle('criar:abrir', (_e, { rota, limites }) => {
    const v = criarVista();
    if (limites) v.setBounds(limites);
    mostrarVista(true);
    v.webContents.loadURL(baseYouvideo() + (rota || '/'));
    return true;
  });
  ipcMain.handle('criar:limites', (_e, limites) => {
    if (vistaCriar && limites) vistaCriar.setBounds(limites);
  });
  ipcMain.handle('criar:visivel', (_e, v) => mostrarVista(!!v));
  ipcMain.handle('criar:acao', (_e, acao) => {
    if (!vistaCriar) return;
    const wc = vistaCriar.webContents;
    if (acao === 'voltar' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (acao === 'recarregar') wc.reload();
    if (acao === 'navegador') shell.openExternal(wc.getURL());
  });

  // ---------- Central Youvideo (Biblioteca e Agenda das redes) ----------
  ipcMain.handle('central:biblioteca', async () => {
    const d = await Central.chamar(store.ler(), '/api/central/biblioteca');
    // Vídeos feitos aqui no PC também entram na Biblioteca
    const locais = fila
      .lista()
      .filter((j) => j.tipo !== 'envio' && j.tipo !== 'nuvem' && j.status === 'concluido' && j.arquivoFinal && fs.existsSync(j.arquivoFinal))
      .map((j) => ({
        chave: `pc:${j.id}`,
        origem: 'pc',
        id: j.id,
        categoria: 'compilacoes',
        titulo: j.nome,
        arquivo: j.arquivoFinal,
        capa: j.capa && fs.existsSync(j.capa) ? j.capa : null,
        curto: j.projeto?.formato?.tipo === 'curto',
        duracao: j.duracao,
        musicas: j.timeline || null,
        criadoEm: j.concluidoEm || j.criadoEm,
        publicado: { youtube: !!j.youtube },
      }));
    return { ...d, categorias: { compilacoes: 'Feitos no PC', ...d.categorias }, itens: [...locais, ...d.itens] };
  });
  ipcMain.handle('central:categoria', (_e, dados) => Central.chamar(store.ler(), '/api/central/categoria', { metodo: 'POST', corpo: dados }));
  ipcMain.handle('central:agenda', () => Central.chamar(store.ler(), '/api/central/agenda'));
  ipcMain.handle('central:agendaAcao', (_e, { id, rede, acao }) =>
    Central.chamar(store.ler(), '/api/central/agenda', { metodo: 'PATCH', corpo: { id, rede, acao } })
  );
  ipcMain.handle('central:agendaApagar', (_e, id) => Central.chamar(store.ler(), '/api/central/agenda', { metodo: 'DELETE', query: { id } }));
  ipcMain.handle('central:testar', async () => {
    const d = await Central.chamar(store.ler(), '/api/central/biblioteca');
    return { ok: true, total: d.itens.length };
  });
  // Baixa um arquivo da Biblioteca para o PC (vídeo, ou o áudio do cover para usar como música)
  ipcMain.handle('central:baixar', async (_e, { url, nome, pasta }) => {
    const ext = path.extname(new URL(url).pathname) || '.mp4';
    const limpo = String(nome || 'arquivo').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 100) || 'arquivo';
    const destino = pasta ? path.join(pasta, limpo + ext) : path.join(app.getPath('userData'), 'cache', 'biblioteca', limpo + ext);
    return Central.baixar(url, destino, (x) => enviar('central:progresso', { url, x }));
  });
  /**
   * Agenda vídeos da Biblioteca: cada item = { item, quando, titulo, descricao, tags, legenda }
   * redes = { youtube: canalId|null, facebook, instagram, tiktok, kwai }
   */
  ipcMain.handle('central:agendar', async (_e, { itens, redes }) => {
    const cfg = store.ler();
    const redesNuvem = ['facebook', 'instagram', 'tiktok', 'kwai'].filter((r) => redes[r]);
    if (redesNuvem.length && !cfg.centralToken) throw new Error('Cadastre a senha da Central em Configurações.');
    if (redes.youtube) {
      const livres = 100 - enviosHoje();
      if (itens.length > livres) throw new Error(`Hoje só dá para subir mais ${Math.max(0, livres)} vídeo(s) no YouTube (limite de 100 por dia).`);
    }
    const remotos = [];
    const locais = [];
    const envios = [];
    for (const it of itens) {
      const v = it.item;
      if (redes.youtube) {
        envios.push({
          arquivo: v.arquivo || null,
          baixarDe: v.arquivo ? null : v.videoUrl,
          chaveArquivo: String(v.chave).replace(/[^\w-]/g, '_'),
          capa: v.capa || null,
          capaUrl: v.thumbnailUrl || null,
          titulo: it.titulo,
          descricao: it.descricao,
          tags: it.tags,
          canalId: redes.youtube,
          privacidade: 'private',
          agendarPara: it.quando,
          curto: !!v.curto,
        });
      }
      if (redesNuvem.length) {
        const post = { titulo: it.titulo, legenda: it.legenda, curto: !!v.curto, redes: redesNuvem, quando: it.quando, chaveBiblioteca: v.chave };
        if (v.videoUrl) remotos.push({ ...post, videoUrl: v.videoUrl, thumbnailUrl: v.thumbnailUrl || null });
        else locais.push({ ...post, arquivo: v.arquivo });
      }
    }
    if (remotos.length) await Central.chamar(cfg, '/api/central/agenda', { metodo: 'POST', corpo: { itens: remotos } });
    if (locais.length) fila.adicionarNuvem(locais);
    if (envios.length) fila.adicionarEnvios(envios);
    return { youtube: envios.length, nuvem: remotos.length + locais.length };
  });

  // ---------- Subir vídeos prontos ----------
  const EXT_VIDEO_ENVIO = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', '3gp'];
  const infoVideos = async (caminhos) => {
    const saida = [];
    for (const c of caminhos) {
      try {
        const i = await probe(c);
        if (!i.temVideo) continue;
        // Se o vídeo foi feito aqui, recupera as músicas (para a IA e a lista com minutagem)
        const job = fila.lista().find((j) => j.arquivoFinal && path.resolve(j.arquivoFinal) === path.resolve(c) && j.tipo !== 'envio');
        saida.push({
          arquivo: c,
          nome: path.basename(c, path.extname(c)),
          duracao: i.duracao,
          largura: i.largura,
          altura: i.altura,
          curto: i.altura > i.largura && i.duracao <= 180,
          capa: capaAoLado(c),
          musicas: job?.timeline || null,
        });
      } catch {}
    }
    return saida;
  };
  ipcMain.handle('envio:escolherVideos', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolher vídeos para subir',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Vídeos', extensions: EXT_VIDEO_ENVIO }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    return r.canceled ? [] : infoVideos(r.filePaths);
  });
  ipcMain.handle('envio:escolherPasta', async () => {
    const r = await dialog.showOpenDialog(janela, { title: 'Escolher pasta com vídeos', properties: ['openDirectory'] });
    return r.canceled ? [] : infoVideos(listarPasta(r.filePaths[0], EXT_VIDEO_ENVIO));
  });
  ipcMain.handle('envio:infoVideos', async (_e, caminhos) => {
    const lista = [];
    for (const c of caminhos || []) {
      try {
        if (fs.statSync(c).isDirectory()) lista.push(...listarPasta(c, EXT_VIDEO_ENVIO));
        else if (EXT_VIDEO_ENVIO.includes(path.extname(c).slice(1).toLowerCase())) lista.push(c);
      } catch {}
    }
    return infoVideos(lista);
  });
  ipcMain.handle('envio:escolherCapa', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolher capa (miniatura)',
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: EXT_IMG }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  // Capa para mostrar na lista: a imagem escolhida ou um quadro do vídeo
  ipcMain.handle('envio:previaCapa', async (_e, { arquivo, capa }) => {
    const pasta = path.join(app.getPath('userData'), 'cache', 'capas');
    fs.mkdirSync(pasta, { recursive: true });
    const origem = capa && fs.existsSync(capa) ? capa : arquivo;
    const st = fs.statSync(origem);
    const nome = require('crypto').createHash('sha1').update(`${origem}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16) + '.jpg';
    const destino = path.join(pasta, nome);
    if (!fs.existsSync(destino)) await gerarMiniatura(origem, destino);
    return destino;
  });
  ipcMain.handle('envio:gerarTextos', async (_e, info) => {
    const cfg = store.ler();
    return IA.gerarTextosVideo(cfg.groqKey, info);
  });
  ipcMain.handle('envio:ultimoAgendado', async (_e, canalId) => {
    const canal = store.canal(canalId);
    if (!canal) return null;
    const cfg = store.ler();
    try {
      return await YT.ultimoAgendado({ credenciais: cfg.google, refreshToken: canal.refreshToken, redirectOriginal: canal.redirect });
    } catch {
      return null;
    }
  });
  ipcMain.handle('envio:contador', () => ({ hoje: enviosHoje(), limite: 100, renova: horaRenovacao() }));
  ipcMain.handle('envio:adicionar', (_e, lista) => {
    if (!Array.isArray(lista) || !lista.length) throw new Error('Nenhum vídeo para subir.');
    const livres = 100 - enviosHoje();
    if (lista.length > livres) throw new Error(`Hoje só dá para subir mais ${Math.max(0, livres)} vídeo(s) (limite do YouTube: 100 por dia).`);
    return fila.adicionarEnvios(lista).length;
  });

  criarJanela();
});

app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

app.on('window-all-closed', () => app.quit());
