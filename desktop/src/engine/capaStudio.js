// Capa dos SHORTS pelo YouTube Studio.
// O YouTube aceita a capa pela API (thumbnails.set) mas NÃO a mostra nos Shorts — no Short só vale a capa trocada
// dentro do Studio. Então o Compilador abre o Studio escondido (com o login que você fez UMA vez por canal, guardado
// numa sessão própria deste PC), põe a imagem no campo da capa e clica em Salvar — o mesmo que você faria à mão.
// Não guarda nem digita senha: o login é feito por você na janela "Entrar no YouTube Studio".
const fs = require('fs');
const { BrowserWindow } = require('electron');

// O Google recusa login em navegador "embutido" com cara de Electron; com a identificação do Firefox ele aceita.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const particao = (canalId) => `persist:studio-${String(canalId).replace(/[^\w-]/g, '')}`;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Janela visível para você entrar na conta Google do canal (só na 1ª vez, ou se o Google pedir de novo). */
function abrirLogin(canalId, titulo = '') {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    title: `Entrar no YouTube Studio — ${titulo || canalId}`,
    autoHideMenuBar: true,
    webPreferences: { partition: particao(canalId), contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setUserAgent(UA);
  // Abre direto a tela de login do Google; depois de entrar, cai no Studio do canal
  const destino = `https://studio.youtube.com/channel/${canalId}`;
  win.loadURL(`https://accounts.google.com/ServiceLogin?service=youtube&passive=false&continue=${encodeURIComponent(destino)}`);
  return new Promise((resolve) => win.on('closed', () => resolve(true)));
}

class ErroStudio extends Error {
  constructor(codigo, msg) {
    super(msg);
    this.codigo = codigo;
  }
}

/**
 * Troca a capa de UM vídeo pelo Studio. Lança ErroStudio com codigo:
 *  LOGIN  = precisa entrar no Studio deste canal (botão no Compilador)
 *  CANAL  = a conta logada não tem acesso a este vídeo
 *  CAMPO  = não achou o campo da capa (vídeo ainda processando etc.) — tenta de novo mais tarde
 */
async function trocarCapaStudio({ canalId, videoId, arquivo, limiteMs = 120000 }) {
  if (!fs.existsSync(arquivo)) throw new ErroStudio('ARQUIVO', 'arquivo da capa sumiu');
  const b64 = fs.readFileSync(arquivo).toString('base64');
  const mime = /\.png$/i.test(arquivo) ? 'image/png' : 'image/jpeg';
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 950,
    webPreferences: { partition: particao(canalId), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.webContents.setUserAgent(UA);
  // "Sair do site? As alterações não foram salvas": nunca trava a janela escondida
  win.webContents.on('will-prevent-unload', (ev) => ev.preventDefault());
  // Janela ESCONDIDA nunca abre a página de login do Google: lá o Google pede chave de acesso/PIN do Windows
  // (aparecia o pedido de PIN a cada 10 min). Caiu no login = para na hora e avisa para usar o botão 🔑.
  let foiProLogin = false;
  const bloquearLogin = (ev, url) => {
    if (/accounts\.google\.com|ServiceLogin|signin/i.test(String(url))) {
      foiProLogin = true;
      try { ev.preventDefault(); } catch {}
      try { win.webContents.stop(); } catch {}
    }
  };
  win.webContents.on('will-navigate', bloquearLogin);
  win.webContents.on('will-redirect', bloquearLogin);
  win.webContents.on('will-frame-navigate', (ev) => bloquearLogin(ev, ev.url));
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  const fim = Date.now() + limiteMs;
  const js = (codigo) => win.webContents.executeJavaScript(codigo, true);
  try {
    await win.loadURL(`https://studio.youtube.com/video/${videoId}/edit`).catch(() => {});
    // espera a página do vídeo montar (ou cair no login)
    let estado = '';
    while (Date.now() < fim) {
      const url = win.webContents.getURL();
      if (foiProLogin || /accounts\.google\.com|ServiceLogin|signin/i.test(url)) throw new ErroStudio('LOGIN', 'precisa entrar no YouTube Studio deste canal');
      estado = await js(`(() => {
        if (document.querySelector('input#file-loader')) return 'campo';
        const t = (document.body && document.body.innerText) || '';
        if (/não tem permissão|don't have permission|Oops|Ops, algo deu errado|video not found|vídeo não encontrado/i.test(t)) return 'sem-acesso';
        return '';
      })()`).catch(() => '');
      if (estado) break;
      await espera(1500);
    }
    // sem acesso = ainda não entrou, ou entrou com outra conta: tratado como login (o botão 🔑 fica em destaque)
    if (estado === 'sem-acesso') throw new ErroStudio('LOGIN', 'a conta deste canal não está logada no Studio do Compilador (ou é outra conta)');
    if (estado !== 'campo') throw new ErroStudio('CAMPO', 'o campo da capa não apareceu (vídeo ainda processando?)');

    // põe a imagem no campo da capa, como se você tivesse escolhido o arquivo
    const ok = await js(`(async () => {
      const bin = atob(${JSON.stringify(b64)});
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const f = new File([u], 'capa.${mime === 'image/png' ? 'png' : 'jpg'}', { type: '${mime}' });
      const dt = new DataTransfer();
      dt.items.add(f);
      const inp = document.querySelector('input#file-loader');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`).catch(() => false);
    if (!ok) throw new ErroStudio('CAMPO', 'não consegui colocar a imagem no campo da capa');

    // espera o Salvar ficar disponível (o Studio processa a imagem) e clica
    let clicou = false;
    while (Date.now() < fim && !clicou) {
      await espera(1500);
      clicou = await js(`(() => {
        const b = document.querySelector('ytcp-button#save');
        if (!b || b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled')) return false;
        b.click();
        return true;
      })()`).catch(() => false);
    }
    if (!clicou) throw new ErroStudio('CAMPO', 'o botão Salvar não liberou');
    // salvo = o botão volta a ficar desativado
    while (Date.now() < fim) {
      await espera(1500);
      const salvo = await js(`(() => { const b = document.querySelector('ytcp-button#save'); return !!b && b.getAttribute('aria-disabled') === 'true'; })()`).catch(() => false);
      if (salvo) return true;
      const erro = await js(`(() => { const e = document.querySelector('ytcp-error-section, .error-text, #error-message'); return e && e.offsetParent ? e.innerText.slice(0, 200) : ''; })()`).catch(() => '');
      if (erro) throw new ErroStudio('CAMPO', `o Studio recusou: ${erro}`);
    }
    throw new ErroStudio('CAMPO', 'o Studio não confirmou que salvou');
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { trocarCapaStudio, abrirLogin, ErroStudio };
