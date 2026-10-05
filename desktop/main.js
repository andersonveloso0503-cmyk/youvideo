// Youvideo Compilador — processo principal (janela, arquivos, fila e YouTube)
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, safeStorage, powerSaveBlocker, nativeTheme, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Store } = require('./src/store');
const { Fila } = require('./src/engine/fila');
const { probe, rodar, detectarEncoder } = require('./src/engine/ffmpeg');
const YT = require('./src/engine/youtube');
const IA = require('./src/engine/ia');
const Central = require('./src/engine/central');
const Montagem = require('./src/engine/montagem');
const Sync = require('./src/sync');
const { analisarMusica, resumoClima } = require('./src/engine/analise');

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
let vistaOfertas = null; // navegador de ofertas (sites de fora), separado das telas do Youvideo
let vistaAtual = null; // qual das duas ocupa o espaço da aba Criar
let vistaNoAr = null; // a vista que está presa na janela agora (ou null)

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
    item.once('done', (_ev, estado) => {
      // Receita de vídeo do site ("Montar no PC"): vira um vídeo na fila, montado aqui
      if (estado === 'completed' && /\.youvideo\.json$/i.test(destino)) {
        try {
          const receita = Montagem.lerReceita(destino);
          fs.rmSync(destino, { force: true });
          fila.adicionarMontagem(receita, pasta);
          enviar('criar:download', { estado: 'montagem', nome: receita.titulo || 'vídeo' });
        } catch (e) {
          enviar('criar:download', { estado: 'erro', nome: item.getFilename(), erro: e.message });
        }
        return;
      }
      enviar('criar:download', { estado, nome: item.getFilename(), arquivo: destino });
    });
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
  const atual = () => vistaAtual === vistaCriar;
  const avisarNavegacao = () =>
    atual() && enviar('criar:navegou', { url: wc.getURL(), titulo: wc.getTitle(), voltar: wc.navigationHistory.canGoBack() });
  wc.on('did-navigate', avisarNavegacao);
  wc.on('did-navigate-in-page', avisarNavegacao);
  wc.on('page-title-updated', avisarNavegacao);
  wc.on('did-start-loading', () => atual() && enviar('criar:carregando', true));
  wc.on('did-stop-loading', () => atual() && enviar('criar:carregando', false));
  wc.on('did-fail-load', (_e, codigo, desc, url, principal) => {
    if (atual() && principal && codigo !== -3) enviar('criar:erro', `Não consegui abrir o Youvideo (${desc}). Confira a internet.`);
  });
  return vistaCriar;
}

// ---------- Navegador de ofertas: sites de fora (mercado da Hotmart, Kiwify, páginas de venda) ----------
// Fica numa sessão própria, sem acesso a nada do app: sem preload, sem permissões, sem downloads.
// Quem navega é você; o app só lê o texto da página aberta quando você clica em "Criar oferta desta página".
const PAINEIS_SEM_OFERTA = ['app.hotmart.com', 'app-vlc.hotmart.com', 'sso.hotmart.com', 'dashboard.kiwify.com', 'dashboard.kiwify.com.br', 'facebook.com', 'www.facebook.com', 'm.facebook.com'];

function enderecoHttp(texto) {
  let t = String(texto || '').trim();
  if (!t) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t;
  try {
    const u = new URL(t);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch {
    return '';
  }
}

function criarVistaOfertas() {
  if (vistaOfertas) return vistaOfertas;
  const sessao = session.fromPartition('persist:ofertas');
  // Alguns sites recusam navegadores embutidos: aqui o app se apresenta como um Chrome comum
  sessao.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
  sessao.setPermissionRequestHandler((_wc, _permissao, responder) => responder(false));
  sessao.on('will-download', (e) => e.preventDefault()); // nada da página de origem é baixado
  vistaOfertas = new WebContentsView({ webPreferences: { session: sessao, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  vistaOfertas.setBackgroundColor('#ffffff');
  const wc = vistaOfertas.webContents;
  const atual = () => vistaAtual === vistaOfertas;
  // Links que abririam outra janela (como "ver página de vendas") abrem aqui mesmo
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) wc.loadURL(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!/^https?:\/\//i.test(url)) e.preventDefault();
  });
  const avisarNavegacao = () =>
    atual() && enviar('criar:navegou', { url: wc.getURL(), titulo: wc.getTitle(), voltar: wc.navigationHistory.canGoBack(), externo: true });
  wc.on('did-navigate', avisarNavegacao);
  wc.on('did-navigate-in-page', avisarNavegacao);
  wc.on('page-title-updated', avisarNavegacao);
  wc.on('did-start-loading', () => atual() && enviar('criar:carregando', true));
  wc.on('did-stop-loading', () => atual() && enviar('criar:carregando', false));
  wc.on('did-fail-load', (_e, codigo, desc, url, principal) => {
    if (atual() && principal && codigo !== -3) enviar('criar:erro', `Não consegui abrir essa página (${desc}). Confira o endereço e a internet.`);
  });
  return vistaOfertas;
}

/** Lê o texto da página aberta no navegador de ofertas e pede a análise ao Youvideo. Devolve a análise. */
async function capturarOferta() {
  if (!vistaOfertas) throw new Error('Abra uma página de vendas primeiro.');
  const wc = vistaOfertas.webContents;
  const url = wc.getURL();
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  if (!host) throw new Error('Abra uma página de vendas primeiro.');
  if (PAINEIS_SEM_OFERTA.includes(host)) {
    throw new Error('Esta é a tela do mercado, não a página de vendas. Abra a página de vendas do produto (a que o comprador vê) e clique de novo.');
  }
  const texto = String(await wc.executeJavaScript('document.body ? document.body.innerText : ""', true)).slice(0, 200000);
  if ((texto.match(/[\p{L}\p{N}]+/gu) || []).length < 150) {
    throw new Error('Esta página tem pouco texto para analisar. Abra a página de vendas completa do produto.');
  }
  let r;
  try {
    r = await fetch(baseYouvideo() + '/api/ofertas/analises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, texto }) });
  } catch {
    throw new Error('Não consegui falar com o Youvideo. Confira a internet.');
  }
  const d = await r.json().catch(() => null);
  if (r.status === 404) throw new Error('O Radar de Ofertas ainda não existe no site — o deploy novo do Youvideo já terminou na Vercel?');
  if (!r.ok || !d?.analise?.id) throw new Error(d?.erro || `Youvideo respondeu ${r.status}`);
  return d.analise;
}

// Cada PC tem um código próprio (não vai junto na sincronização de configurações)
function identidadePc() {
  let { pcId } = store.ler();
  if (!pcId) {
    pcId = `${os.hostname().replace(/[^\w-]/g, '').slice(0, 20) || 'pc'}-${require('crypto').randomBytes(3).toString('hex')}`;
    store.salvar({ pcId });
  }
  return { pc: pcId, pcNome: os.hostname() };
}

function mostrarVista(visivel) {
  if (!janela) return;
  const alvo = visivel ? vistaAtual : null;
  if (vistaNoAr && vistaNoAr !== alvo) {
    janela.contentView.removeChildView(vistaNoAr);
    vistaNoAr = null;
  }
  if (alvo && !vistaNoAr) {
    janela.contentView.addChildView(alvo);
    vistaNoAr = alvo;
  }
}

function criarJanela() {
  nativeTheme.themeSource = 'dark';
  // Abre do tamanho da tela (telas menores que 1400x860 abrem maximizadas)
  const { screen } = require('electron');
  const area = screen.getPrimaryDisplay().workAreaSize;
  const cabe = area.width >= 1400 && area.height >= 860;
  janela = new BrowserWindow({
    width: Math.min(1400, area.width),
    height: Math.min(860, area.height),
    minWidth: 1000,
    minHeight: 640,
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
  if (!cabe) janela.maximize();
  janela.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.COMPILADOR_CAPTURA) {
    // Teste automático: tira um print da tela e fecha
    janela.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (process.env.COMPILADOR_JS) await janela.webContents.executeJavaScript(process.env.COMPILADOR_JS).catch(() => {});
      await new Promise((r) => setTimeout(r, 1200));
      const img = await janela.webContents.capturePage();
      fs.writeFileSync(process.env.COMPILADOR_CAPTURA, img.toPNG());
      if (vistaNoAr) fs.writeFileSync(process.env.COMPILADOR_CAPTURA + '.vista.png', (await vistaNoAr.webContents.capturePage()).toPNG());
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
    identidade: () => identidadePc(),
  });
  // Voltou de uma atualização: recomeça sozinho o que foi interrompido
  const flagRetomar = path.join(dirDados, 'retomar-apos-atualizar');
  if (fs.existsSync(flagRetomar)) {
    fs.rmSync(flagRetomar, { force: true });
    for (const j of fila.lista()) if (j.status === 'interrompido') fila.retentar(j.id);
  }
  fila.proximo(); // retoma o que ficou aguardando na última vez
  // A tela recebe a fila "enxuta" (sem roteiro, palavras da legenda etc.) e no máximo
  // ~3 vezes por segundo — antes ia tudo a cada % de progresso e a tela travava (ficava preta)
  const paraTela = (j) => {
    const { receita, projeto, envio, nuvem, ...resto } = j;
    return {
      ...resto,
      ...(projeto ? { projeto: { formato: projeto.formato, musicas: { length: projeto.musicas?.length || 0 }, fundos: { length: projeto.fundos?.length || 0 } } } : {}),
      ...(receita ? { receita: { duracao: receita.duracao, categoria: receita.categoria, titulo: receita.titulo } } : {}),
      ...(envio ? { envio: { canalId: envio.canalId, agendarPara: envio.agendarPara, fabricaId: envio.fabricaId } } : {}),
      ...(nuvem ? { nuvem: { quando: nuvem.quando, redes: nuvem.redes } } : {}),
    };
  };
  let tMudou = null;
  fila.on('mudou', () => {
    if (tMudou) return;
    tMudou = setTimeout(() => {
      tMudou = null;
      const jobs = fila.lista();
      enviar('fila:mudou', jobs.map(paraTela));
      atualizarBloqueioSono(jobs);
    }, 350);
  });
  // Fechou o app no meio: grava a fila e para o ffmpeg (não fica rodando escondido)
  app.on('before-quit', () => {
    try { fila.salvarAgora(); } catch {}
    try { fila.pararTudo(); } catch {}
  });

  // ---------- Montar no PC: pega os vídeos que o site mandou montar aqui ----------
  let buscandoPedidos = false;
  async function buscarPedidosDoSite() {
    const cfg = store.ler();
    if (buscandoPedidos || !cfg.centralToken) return;
    buscandoPedidos = true;
    try {
      const { pedidos = [] } = await Central.chamar(cfg, '/api/central/montar-pc');
      const pasta = cfg.ultimoProjeto?.saida?.pasta || app.getPath('videos');
      for (const p of pedidos) {
        if (fila.pedidoNaFila(p.id)) continue;
        const { ok } = await Central.chamar(cfg, '/api/central/montar-pc', { metodo: 'POST', corpo: { id: p.id, acao: 'pegar', pc: os.hostname() } });
        if (!ok) continue; // outro PC já pegou
        try {
          const receita = p.receita;
          if (receita?.tipo !== 'youvideo-montagem' || !receita.clipes?.length) throw new Error('Receita inválida.');
          if (!receita.titulo) receita.titulo = p.titulo || 'Vídeo do Youvideo';
          fila.adicionarMontagem(receita, pasta, { pedidoId: p.id });
        } catch (e) {
          Central.chamar(cfg, '/api/central/montar-pc', { metodo: 'POST', corpo: { id: p.id, acao: 'erro', erro: e.message } }).catch(() => {});
        }
      }
    } catch {
      // sem internet / Central fora do ar: tenta de novo na próxima volta
    } finally {
      buscandoPedidos = false;
    }
  }
  setTimeout(buscarPedidosDoSite, 8000);
  setInterval(buscarPedidosDoSite, 45000);

  // ---------- Fábrica: sobe no YouTube (agendado) os Shorts que ficaram prontos ----------
  let buscandoFabrica = false;
  const seoFalhas = {}; // quantas vezes a IA de título falhou em cada vídeo da fábrica
  // Orações do dia entram sozinhas na playlist do período (o app usa a que já existir com esse nome ou cria)
  const PLAYLISTS_ORACAO = {
    manha: { titulo: 'Oração da Manhã', descricao: 'Uma oração nova toda manhã para começar o dia com Deus. 🙏 Inscreva-se no canal para orar com a gente todos os dias.' },
    noite: { titulo: 'Oração da Noite', descricao: 'Uma oração nova toda noite para entregar o dia a Deus e dormir em paz. 🙏 Inscreva-se no canal para orar com a gente todos os dias.' },
  };
  async function fabricaParaYoutube() {
    const cfg = store.ler();
    if (buscandoFabrica || !cfg.centralToken) return;
    buscandoFabrica = true;
    try {
      const { itens = [] } = await Central.chamar(cfg, '/api/central/fabrica', { query: { youtube: '1' } });
      for (const it of itens) {
        const canalId = it.canalYoutube?.id;
        if (!canalId || !store.canal(canalId)) continue; // esse canal está conectado em outro PC
        if (fila.lista().some((j) => j.envio?.fabricaId === it.id && !['erro', 'cancelado'].includes(j.status))) continue;
        const { ok } = await Central.chamar(cfg, '/api/central/fabrica', { metodo: 'POST', corpo: { id: it.id, acao: 'youtube-pegar', pc: os.hostname() } });
        if (!ok) continue;
        let quando = it.quandoYoutube ? new Date(it.quandoYoutube) : null;
        if (quando && quando.getTime() < Date.now() + 20 * 60e3) quando = new Date(Date.now() + 20 * 60e3); // ficou pronto atrasado
        let tags = Array.isArray(it.tags) ? it.tags : String(it.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
        let titulo = String(it.titulo || it.tema || 'Short');
        let descricao = it.descricao || '';
        // SEO de verdade: título, descrição e tags com base no que as pessoas buscam no YouTube
        let seoOk = false;
        if (it.oracao) {
          // Oração do dia: o título já vem pronto no formato que as pessoas procuram ("Oração da Manhã de 7 de Outubro: ...")
          const periodo = it.oracao.periodo === 'noite' ? 'oraçãodanoite' : 'oraçãodamanhã';
          const limpo = titulo.replace(/\s*#[\p{L}\p{N}_]+/gu, '').trim();
          titulo = [`${limpo} #oração #${periodo}`, `${limpo} #oração`, limpo].find((t) => t.length <= 100) || limpo.slice(0, 100);
          const fixas = ['oração', it.oracao.periodo === 'noite' ? 'oração da noite' : 'oração da manhã', 'oração do dia', 'oração de hoje', 'oração poderosa', 'deus', 'jesus', 'fé'];
          tags = [...new Set([...fixas, ...tags].map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
          descricao = `${String(descricao).replace(/#[\p{L}\p{N}_]+/gu, '').trim()}\n\n🙏 Inscreva-se para orar com a gente todos os dias.\n\n#oração #${periodo} #fé #Shorts`;
          seoOk = true;
        } else if (cfg.groqKey) {
          try {
            const usados = fila.lista().filter((j) => j.envio?.fabricaId).map((j) => j.nome).slice(-12);
            const r = await IA.gerarTextosVideo(cfg.groqKey, {
              nome: it.titulo || it.tema,
              musicas: [],
              duracaoSeg: 60,
              curto: true,
              tipo: 'historia', // título começa pelo nome da história (nada de "Por Que...?" em todo vídeo)
              canal: it.canalYoutube?.titulo || '',
              pedido: it.corte
                ? `${it.corte.tipo === 'comico' ? 'cena bíblica de humor leve' : 'cena bíblica dramática'}: ${it.tema}`
                : `história bíblica: ${it.serie?.nome || it.tema}`,
              contexto: it.corte
                ? `Canal cristão de histórias da Bíblia em Shorts. Este vídeo é uma cena curta em diálogo, com os personagens falando (${it.corte.tipo === 'comico' ? 'humor leve e respeitoso, em desenho animado' : 'cena dramática, com imagens realistas'}). É criação original: não diga que é trecho de filme ou série. Resumo: ${String(it.descricao || '').slice(0, 400)}`
                : `Canal cristão de histórias da Bíblia em Shorts (${it.estilo === 'desenho' ? 'desenho animado' : 'narração com imagens realistas'}). Resumo: ${String(it.descricao || '').slice(0, 400)}`,
              evitar: usados,
            });
            if (r.titulo) titulo = r.titulo;
            if (r.descricao) descricao = r.descricao;
            if (r.tags?.length) tags = r.tags;
            seoOk = !!r.titulo;
          } catch {
            // Groq ocupada / fora do ar
          }
        }
        if (!seoOk) {
          // A IA não respondeu: devolve o vídeo para a fila do site e tenta de novo na próxima volta (2 min).
          // Depois de 4 tentativas sobe com um texto enxuto feito aqui mesmo (nunca com o texto longo do roteiro).
          seoFalhas[it.id] = (seoFalhas[it.id] || 0) + 1;
          const temTempo = !it.quandoYoutube || new Date(it.quandoYoutube).getTime() - Date.now() > 40 * 60e3;
          if (cfg.groqKey && seoFalhas[it.id] <= 4 && temTempo) {
            await Central.chamar(cfg, '/api/central/fabrica', { metodo: 'POST', corpo: { id: it.id, acao: 'youtube-repetir' } }).catch(() => {});
            continue;
          }
          const frases = String(it.descricao || '').replace(/#[\p{L}\p{N}_]+/gu, '').split(/(?<=[.!?])\s+/).filter(Boolean);
          const resumo = frases.slice(0, 2).join(' ').slice(0, 320).trim();
          const fixas = ['histórias bíblicas', 'história da bíblia', 'jesus', 'bíblia', 'fé', 'palavra de deus', 'shorts cristãos'];
          tags = [...new Set([...tags, ...fixas].map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
          const hashtags = ['#historiasbiblicas', '#jesus', '#fé', '#biblia', '#Shorts'].join(' ');
          descricao = `${resumo}\n\n🙏 Inscreva-se para receber uma história da Bíblia por dia.\n\n${hashtags}`;
          titulo = IA.comHashtags(titulo.replace(/\s*#[\p{L}\p{N}_]+/gu, '').trim(), ['histórias bíblicas', 'jesus'], true);
        }
        delete seoFalhas[it.id];
        // Série: o título no YouTube sempre mostra a parte, e a descrição lembra de seguir o canal
        const serie = it.serie && it.serie.total > 1 ? it.serie : null;
        if (serie) {
          const sufixo = ` (Parte ${serie.parte}/${serie.total})`;
          const base = titulo.replace(/\s*[-–—|(]*\s*parte\s*\d+\s*(\/\s*\d+|de\s*\d+)?\s*\)?\s*/gi, ' ').replace(/\s*#[\p{L}\p{N}_]+/gu, '').trim();
          titulo = IA.comHashtags(`${base.slice(0, 100 - sufixo.length)}${sufixo}`, [serie.nome, ...tags], true);
          const aviso = serie.parte < serie.total
            ? `👉 Esta é a PARTE ${serie.parte} de ${serie.total} da série "${serie.nome}". Inscreva-se para não perder a parte ${serie.parte + 1}!`
            : `✅ Parte final da série "${serie.nome}". Veja as outras partes no canal e inscreva-se para a próxima série!`;
          descricao = `${aviso}\n\n${descricao}`.trim();
        }
        fila.adicionarEnvios([{
          arquivo: null,
          baixarDe: it.videoUrl,
          chaveArquivo: `fabrica-${it.id}`,
          capa: null,
          capaUrl: it.thumbnailUrl || null, // cena do vídeo: base da capa chamativa
          titulo: titulo.slice(0, 100),
          descricao: /#shorts/i.test(descricao) ? descricao : `${descricao}\n\n#Shorts`.trim(),
          tags,
          canalId,
          privacidade: 'private',
          agendarPara: quando ? quando.toISOString() : null,
          curto: true,
          fabricaId: it.id,
          tipo: it.oracao ? 'oracao' : 'historias', // categoria "Pessoas e blogs" e idioma português (não "Música")
          playlist: it.oracao ? PLAYLISTS_ORACAO[it.oracao.periodo === 'noite' ? 'noite' : 'manha'] : null,
          conteudoIa: true, // histórias feitas com IA: marca no YouTube
          botao: (() => { const f = path.join(app.getPath('userData'), 'cache', 'botao', 'v2-pt', 'botao.mov'); return fs.existsSync(f) ? f : null; })(),
        }]);
      }
    } catch {
      // sem internet: tenta na próxima volta
    } finally {
      buscandoFabrica = false;
    }
  }
  // ---------- Créditos: avisa quando fal.ai, Flux (imagens) ou ElevenLabs estão acabando ----------
  let ultimosCreditos = null;
  const avisados = {};
  async function checarCreditos() {
    const cfg = store.ler();
    try {
      const base = String(cfg.centralUrl || Central.URL_PADRAO).replace(/\/+$/, '');
      const r = await fetch(`${base}/api/orcamento`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) return;
      const { servicos = {} } = await r.json();
      const itens = [];
      const add = (servico, nome, nivel, texto) => itens.push({ servico, nome, nivel, texto });
      const fal = servicos.fal;
      if (fal?.ok && fal.saldo != null) {
        const n = fal.saldo < 1.5 ? 'critico' : fal.saldo < 5 ? 'baixo' : 'ok';
        add('fal', 'fal.ai (animação)', n, `US$ ${Number(fal.saldo).toFixed(2)}`);
      }
      const flux = servicos.flux;
      if (flux?.ok && flux.saldo != null) {
        const n = flux.saldo < 100 ? 'critico' : flux.saldo < 300 ? 'baixo' : 'ok';
        add('flux', 'Flux (imagens)', n, `${Math.round(flux.saldo)} créditos`);
      }
      const el = servicos.elevenlabs;
      if (el?.ok && el.saldo != null) {
        const limite = Number(el.limite) || 0;
        const n = el.saldo < 5000 ? 'critico' : el.saldo < Math.max(20000, limite * 0.1) ? 'baixo' : 'ok';
        add('elevenlabs', 'ElevenLabs (voz)', n, `${Math.round(el.saldo / 1000)} mil caracteres`);
      }
      ultimosCreditos = { itens, em: Date.now() };
      enviar('creditos:status', ultimosCreditos);
      // Notificação do Windows: uma vez por dia para cada serviço baixo/crítico
      const hoje = new Date().toISOString().slice(0, 10);
      for (const i of itens) {
        if (i.nivel === 'ok') continue;
        const chave = `${i.servico}-${i.nivel}-${hoje}`;
        if (avisados[chave]) continue;
        avisados[chave] = true;
        if (Notification.isSupported()) {
          new Notification({
            title: i.nivel === 'critico' ? `⚠ ${i.nome}: crédito acabando` : `${i.nome}: crédito baixo`,
            body: `Restam ${i.texto}. Recarregue para a Fábrica e as histórias não pararem.`,
          }).show();
        }
      }
    } catch {
      // sem internet: tenta depois
    }
  }
  // ---------- Lembrete: hora de postar no TikTok / Kwai (pelo celular) ----------
  const lembrados = new Set();
  async function lembrarPostsCelular() {
    const cfg = store.ler();
    if (!cfg.centralToken) return;
    try {
      const { itens = [] } = await Central.chamar(cfg, '/api/central/agenda');
      const agora = Date.now();
      const faltam = (a) => ['tiktok', 'kwai'].filter((r) => a.redes?.[r]?.status === 'manual');
      // Chegou a hora (até 6 h de atraso) e ainda não foi postado
      const naHora = itens.filter((a) => faltam(a).length && new Date(a.quando).getTime() <= agora && agora - new Date(a.quando).getTime() < 6 * 3600e3 && !lembrados.has(a.id));
      if (!naHora.length || !Notification.isSupported()) return;
      naHora.forEach((a) => lembrados.add(a.id));
      const base = String(cfg.centralUrl || Central.URL_PADRAO).replace(/\/+$/, '');
      const n = new Notification({
        title: naHora.length === 1 ? `📱 Hora de postar no ${faltam(naHora[0]).map((r) => (r === 'tiktok' ? 'TikTok' : 'Kwai')).join(' e ')}` : `📱 ${naHora.length} vídeos para postar no TikTok/Kwai`,
        body: `${naHora.map((a) => a.titulo).join(' • ').slice(0, 180)}\nNo celular: ${base}/postar (a legenda já vai copiada)`,
      });
      n.on('click', () => {
        if (janela) { janela.show(); janela.focus(); }
        enviar('abrir:agenda', true);
      });
      n.show();
    } catch {}
  }
  setTimeout(lembrarPostsCelular, 30000);
  setInterval(lembrarPostsCelular, 5 * 60e3);

  setTimeout(checarCreditos, 20000);
  setInterval(checarCreditos, 30 * 60e3);
  ipcMain.handle('creditos:ler', async () => {
    if (!ultimosCreditos || Date.now() - ultimosCreditos.em > 5 * 60e3) await checarCreditos();
    return ultimosCreditos;
  });

  setTimeout(fabricaParaYoutube, 15000);
  setInterval(fabricaParaYoutube, 120000);
  ipcMain.handle('fabrica:listar', () => Central.chamar(store.ler(), '/api/central/fabrica'));
  ipcMain.handle('fabrica:criar', (_e, dados) => Central.chamar(store.ler(), '/api/central/fabrica', { metodo: 'POST', corpo: { ...dados, acao: 'criar' } }));
  ipcMain.handle('fabrica:acao', (_e, { id, acao }) => Central.chamar(store.ler(), '/api/central/fabrica', { metodo: 'POST', corpo: { id, acao } }));

  // ---------- Fila deste PC na nuvem (para acompanhar de outro computador) ----------
  let tFilaNuvem = null;
  let ultimaFilaNuvem = 0;
  async function mandarFilaParaNuvem() {
    tFilaNuvem = null;
    const cfg = store.ler();
    if (!cfg.centralToken) return;
    ultimaFilaNuvem = Date.now();
    const jobs = fila.lista().slice(-40).reverse().map((j) => ({
      id: j.id, tipo: j.tipo || 'video', nome: j.nome, status: j.status, etapa: j.etapa, progresso: j.progresso,
      restanteSeg: j.restanteSeg, duracao: j.duracao, erro: j.erro, criadoEm: j.criadoEm, concluidoEm: j.concluidoEm,
      nuvem: j.espelho?.status || null,
    }));
    const { pc, pcNome } = identidadePc();
    await Central.chamar(cfg, '/api/central/pc-filas', { metodo: 'PUT', corpo: { pc, pcNome, jobs } }).catch(() => {});
  }
  fila.on('mudou', () => {
    if (tFilaNuvem) return;
    tFilaNuvem = setTimeout(mandarFilaParaNuvem, Math.max(3000, 15000 - (Date.now() - ultimaFilaNuvem)));
  });
  setTimeout(mandarFilaParaNuvem, 5000);
  setInterval(() => !tFilaNuvem && mandarFilaParaNuvem(), 60000);
  ipcMain.handle('fila:outrosPcs', async () => {
    const { pcs = [] } = await Central.chamar(store.ler(), '/api/central/pc-filas');
    const eu = identidadePc().pc;
    return pcs.filter((p) => p.pc !== eu).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
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
      const comparar = (a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        return 0;
      };
      // O GitHub não lista em ordem de versão (1.9.9 aparece antes de 1.9.12): pega a MAIOR versão
      const rel = lista
        .filter((x) => String(x.tag_name).startsWith('compilador-v') && !x.draft && x.assets?.some((a) => a.name.endsWith('.exe')))
        .sort((a, b) => comparar(b.tag_name.replace('compilador-v', ''), a.tag_name.replace('compilador-v', '')))[0];
      const exe = rel && rel.assets.find((a) => a.name.endsWith('.exe'));
      if (!rel || !exe) return null;
      const nova = rel.tag_name.replace('compilador-v', '');
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
    // Marca para retomar sozinho o que estava gerando/enviando quando o app voltar
    try { fs.writeFileSync(path.join(dirDados, 'retomar-apos-atualizar'), new Date().toISOString()); } catch {}
    // Instala em silêncio (sem clicar em nada) e abre o app de novo no final
    require('child_process').spawn(destino, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
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
  // ---------- Arrumar os vídeos que já estão no canal (categoria, idioma e títulos fracos) ----------
  ipcMain.handle('canais:conferir', async (_e, id) => {
    const canal = store.canal(id);
    if (!canal) throw new Error('Canal não encontrado. Conecte de novo em Contas YouTube.');
    const cfg = store.ler();
    const r = await YT.conferirCanal({ credenciais: cfg.google, refreshToken: canal.refreshToken, redirectOriginal: canal.redirect });
    // Títulos novos sugeridos pela IA para os fracos (o dono confere e pode mudar antes de aplicar)
    const fracos = r.videos.filter((v) => v.motivoTitulo);
    let avisoIa = '';
    if (fracos.length) {
      if (!cfg.groqKey) avisoIa = 'Cadastre a chave da Groq em Configurações para a IA sugerir os títulos novos.';
      else {
        try {
          const novos = await IA.titulosHistoria(cfg.groqKey, fracos);
          for (const v of fracos) v.tituloNovo = novos[v.id] || '';
        } catch (e) {
          avisoIa = `A IA não respondeu agora (${String(e.message || e).slice(0, 80)}). Dá para escrever os títulos à mão ou conferir de novo depois.`;
        }
      }
    }
    return { ...r, avisoIa };
  });
  ipcMain.handle('canais:corrigir', async (_e, { id, itens, categoria, idioma }) => {
    const canal = store.canal(id);
    if (!canal) throw new Error('Canal não encontrado. Conecte de novo em Contas YouTube.');
    if (!Array.isArray(itens) || !itens.length) throw new Error('Nada para arrumar.');
    const cfg = store.ler();
    return YT.corrigirVideos({
      credenciais: cfg.google, refreshToken: canal.refreshToken, redirectOriginal: canal.redirect,
      itens: itens.map((i) => ({ id: String(i.id), titulo: i.titulo ? String(i.titulo) : '' })),
      categoria: categoria || undefined, idioma: idioma || undefined,
      onProgresso: (x) => enviar('canais:progresso', x),
    });
  });
  ipcMain.handle('canais:remover', (_e, id) => {
    store.removerCanal(id);
    sincronizarDepois();
    return store.canaisParaTela();
  });

  // ---------- Fila ----------
  ipcMain.handle('fila:listar', () => fila.lista().map(paraTela));
  ipcMain.handle('fila:adicionar', (_e, projeto) => fila.adicionar(projeto).length);
  ipcMain.handle('fila:cancelar', (_e, id) => fila.cancelar(id));
  ipcMain.handle('fila:remover', (_e, id) => fila.remover(id));
  ipcMain.handle('fila:retentar', (_e, id) => fila.retentar(id));
  ipcMain.handle('fila:limpar', (_e, tudo) => fila.limpar(!!tudo));
  // Receita baixada do site fora do app: escolhe o arquivo e manda montar
  ipcMain.handle('fila:abrirReceita', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Abrir receita de vídeo do Youvideo',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Receita do Youvideo', extensions: ['json'] }],
    });
    if (r.canceled) return 0;
    const pasta = store.ler().ultimoProjeto?.saida?.pasta || app.getPath('videos');
    for (const f of r.filePaths) fila.adicionarMontagem(Montagem.lerReceita(f), pasta);
    return r.filePaths.length;
  });

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

  // ---------- Clima das músicas (calma / média / animada) ----------
  ipcMain.handle('midia:analisar', async (_e, arquivo) => {
    try {
      return await analisarMusica(arquivo, path.join(app.getPath('userData'), 'cache'));
    } catch {
      return { bpm: null, nota: null, energia: null };
    }
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
    vistaAtual = v;
    mostrarVista(true);
    v.webContents.loadURL(baseYouvideo() + (rota || '/'));
    return true;
  });
  ipcMain.handle('criar:limites', (_e, limites) => {
    if (vistaAtual && limites) vistaAtual.setBounds(limites);
  });
  ipcMain.handle('criar:visivel', (_e, v) => mostrarVista(!!v));

  // ---------- Navegador de ofertas (dentro da aba Criar) ----------
  ipcMain.handle('ofertas:abrir', (_e, { url, limites }) => {
    const destino = enderecoHttp(url);
    if (!destino) throw new Error('Esse endereço não parece válido.');
    const v = criarVistaOfertas();
    if (limites) v.setBounds(limites);
    vistaAtual = v;
    mostrarVista(true);
    v.webContents.loadURL(destino);
    return true;
  });
  ipcMain.handle('ofertas:acao', (_e, acao) => {
    if (!vistaOfertas) return;
    const wc = vistaOfertas.webContents;
    if (acao === 'voltar' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (acao === 'recarregar') wc.reload();
    if (acao === 'navegador' && /^https?:\/\//i.test(wc.getURL())) shell.openExternal(wc.getURL());
    if (acao && acao.ir) {
      const destino = enderecoHttp(acao.ir);
      if (!destino) throw new Error('Esse endereço não parece válido.');
      wc.loadURL(destino);
    }
  });
  ipcMain.handle('ofertas:capturar', async (_e, { limites } = {}) => {
    const analise = await capturarOferta();
    // análise pronta: volta para as telas do Youvideo, já no passo "o seu produto"
    const v = criarVista();
    if (limites) v.setBounds(limites);
    vistaAtual = v;
    mostrarVista(true);
    v.webContents.loadURL(`${baseYouvideo()}/ofertas?analise=${encodeURIComponent(analise.id)}`);
    return { id: analise.id, nicho: analise.esqueleto?.nicho || '' };
  });
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
    const eu = identidadePc().pc;
    let videosNuvem = [];
    try {
      ({ videos: videosNuvem = [] } = await Central.chamar(store.ler(), '/api/central/pc-videos'));
    } catch {}
    const naNuvem = new Set(videosNuvem.filter((v) => v.pc === eu).map((v) => v.jobId));
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
        curto: j.projeto?.formato?.tipo === 'curto' || !!j.curto,
        duracao: j.duracao,
        musicas: j.timeline || null,
        clima: j.clima || resumoClima(j.projeto?.musicas),
        criadoEm: j.concluidoEm || j.criadoEm,
        publicado: { youtube: !!j.youtube },
        // Ainda na nuvem (a limpeza automática pode ter apagado): agendar nas redes não sobe de novo
        videoUrl: j.videoUrlSite || (j.videoUrlNuvem && naNuvem.has(j.id) ? j.videoUrlNuvem : undefined),
        ...(j.receita?.categoria ? { categoria: j.receita.categoria } : {}),
      }));
    // Vídeos feitos em outros PCs (subiram para a nuvem sozinhos)
    const idsLocais = new Set(locais.map((l) => l.id));
    let deOutros = [];
    try {
      deOutros = videosNuvem
        .filter((v) => !(v.pc === eu && idsLocais.has(v.jobId)))
        .map((v) => ({
          chave: `nuvem-pc:${v.id}`,
          origem: 'nuvem-pc',
          id: v.id,
          categoria: v.categoria || 'compilacoes',
          titulo: v.titulo,
          videoUrl: v.videoUrl,
          thumbnailUrl: v.capaUrl || null,
          curto: !!v.curto,
          duracao: v.duracao,
          musicas: v.musicas?.length ? v.musicas : null,
          clima: v.clima || '',
          criadoEm: v.criadoEm,
          pcNome: v.pcNome,
          publicado: {},
        }));
    } catch {}
    return { ...d, categorias: { compilacoes: 'Feitos no PC', ...d.categorias }, itens: [...locais, ...deOutros, ...d.itens] };
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
    // Vídeos da empresa (LCS) nunca vão para o YouTube: saem só na Página e no Instagram da LCS
    const vaiYoutube = (v) => !!redes.youtube && v?.categoria !== 'empresa';
    const paraYoutube = itens.filter((it) => vaiYoutube(it.item)).length;
    if (paraYoutube) {
      const livres = 100 - enviosHoje();
      if (paraYoutube > livres) throw new Error(`Hoje só dá para subir mais ${Math.max(0, livres)} vídeo(s) no YouTube (limite de 100 por dia).`);
    }
    const remotos = [];
    const locais = [];
    const envios = [];
    for (const it of itens) {
      const v = it.item;
      if (vaiYoutube(v)) {
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
          tipo: v.categoria || null, // histórias, séries, músicas...: decide a categoria no YouTube
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
          clima: job ? job.clima || resumoClima(job.projeto?.musicas) : '',
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
  ipcMain.handle('envio:previaCapa', async (_e, { arquivo, capa, vertical }) => {
    const pasta = path.join(app.getPath('userData'), 'cache', 'capas');
    fs.mkdirSync(pasta, { recursive: true });
    const origem = capa && fs.existsSync(capa) ? capa : arquivo;
    const st = fs.statSync(origem);
    const nome = require('crypto').createHash('sha1').update(`${origem}|${st.size}|${st.mtimeMs}|${vertical ? 'v' : 'h'}`).digest('hex').slice(0, 16) + '.jpg';
    const destino = path.join(pasta, nome);
    if (!fs.existsSync(destino)) await gerarMiniatura(origem, destino, { vertical: !!vertical });
    return destino;
  });
  // Guarda os últimos títulos e começos de descrição para a IA não repetir de um lote para o outro
  ipcMain.handle('envio:gerarTextos', async (_e, info) => {
    const cfg = store.ler();
    const hist = Array.isArray(cfg.historicoTextos) ? cfg.historicoTextos : [];
    const r = await IA.gerarTextosVideo(cfg.groqKey, {
      ...info,
      evitar: [...new Set([...(info.evitar || []), ...hist.map((h) => h.t)])].slice(-20),
      evitarInicios: hist.map((h) => h.d).filter(Boolean).slice(-10),
    });
    const inicio = String(r.descricao || '').split(/(?<=[.!?])\s/)[0].slice(0, 140);
    store.salvar({ historicoTextos: [...hist, { t: r.titulo, d: inicio }].slice(-40) });
    return r;
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
