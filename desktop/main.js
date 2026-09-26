// Youvideo Compilador — processo principal (janela, arquivos, fila e YouTube)
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, powerSaveBlocker, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Store } = require('./src/store');
const { Fila } = require('./src/engine/fila');
const { probe, detectarEncoder } = require('./src/engine/ffmpeg');
const YT = require('./src/engine/youtube');

const EXT_AUDIO = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'mp4', 'webm'];
const EXT_FUNDO = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'mp4', 'mov', 'webm', 'mkv', 'avi'];

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
    for (const k of ['falKey', 'groqKey']) if (mascarado(limpo[k]) || limpo[k] === undefined) delete limpo[k];
    if (limpo.google && mascarado(limpo.google.clientSecret)) delete limpo.google.clientSecret;
    store.salvar(limpo);
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
      filters: [{ name: 'Áudio', extensions: EXT_AUDIO }],
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
      filters: [{ name: 'Imagens e vídeos', extensions: EXT_FUNDO }],
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

  // ---------- Canais do YouTube ----------
  ipcMain.handle('canais:listar', () => store.canaisParaTela());
  ipcMain.handle('canais:autorizar', async () => {
    const cfg = store.ler();
    const r = await YT.autorizarCanal(cfg.google, (url) => shell.openExternal(url));
    store.salvarCanal({ ...r, redirect: YT.REDIRECT });
    return store.canaisParaTela();
  });
  ipcMain.handle('canais:porToken', async (_e, { refreshToken }) => {
    const cfg = store.ler();
    const token = String(refreshToken || '').trim();
    if (!token) throw new Error('Cole o refresh token.');
    const redirect = cfg.google.redirectOriginal || YT.REDIRECT;
    const canal = await YT.canalPorToken(cfg.google, token, redirect);
    store.salvarCanal({ canal, refreshToken: token, redirect });
    return store.canaisParaTela();
  });
  ipcMain.handle('canais:remover', (_e, id) => {
    store.removerCanal(id);
    return store.canaisParaTela();
  });

  // ---------- Fila ----------
  ipcMain.handle('fila:listar', () => fila.lista());
  ipcMain.handle('fila:adicionar', (_e, projeto) => fila.adicionar(projeto).length);
  ipcMain.handle('fila:cancelar', (_e, id) => fila.cancelar(id));
  ipcMain.handle('fila:remover', (_e, id) => fila.remover(id));
  ipcMain.handle('fila:retentar', (_e, id) => fila.retentar(id));
  ipcMain.handle('fila:limpar', () => fila.limpar());

  criarJanela();
});

app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

app.on('window-all-closed', () => app.quit());
