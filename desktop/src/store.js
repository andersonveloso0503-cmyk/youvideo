// Configurações e canais salvos no PC. Chaves e tokens ficam criptografados
// com a proteção do próprio Windows (safeStorage).
const fs = require('fs');
const path = require('path');

const PADRAO = {
  falKey: '',
  groqKey: '',
  claudeKey: '',
  google: { clientId: '', clientSecret: '', redirectOriginal: '' },
  modo: 'normal', // leve | normal | maximo
  simultaneos: 1,
  encoder: 'auto',
  pastaSaida: '',
  centralUrl: 'https://youvideors2.vercel.app',
  centralToken: '',
  ultimoProjeto: null,
};

const SECRETOS = ['falKey', 'groqKey', 'claudeKey', 'centralToken'];

// Grava num arquivo novo e troca de uma vez: se o PC desligar no meio, o arquivo antigo fica inteiro
function gravarSeguro(arquivo, texto) {
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, texto);
  try {
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).size > 2) fs.copyFileSync(arquivo, arquivo + '.bak');
  } catch {}
  fs.renameSync(tmp, arquivo);
}

// Lê o arquivo; se estiver estragado (PC travou gravando), usa a cópia de segurança
function lerComReserva(arquivo, valido) {
  for (const a of [arquivo, arquivo + '.bak']) {
    try {
      const j = JSON.parse(fs.readFileSync(a, 'utf8').replace(/\u0000/g, '').trim());
      if (valido(j)) return j;
    } catch {}
  }
  return null;
}

class Store {
  constructor(dir, safeStorage) {
    this.arquivo = path.join(dir, 'config.json');
    this.arquivoCanais = path.join(dir, 'canais.json');
    this.safe = safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
    fs.mkdirSync(dir, { recursive: true });
  }

  cifrar(txt) {
    if (!txt) return '';
    return this.safe ? 'enc:' + this.safe.encryptString(txt).toString('base64') : txt;
  }

  decifrar(txt) {
    if (!txt) return '';
    if (txt.startsWith('enc:') && this.safe) {
      try {
        return this.safe.decryptString(Buffer.from(txt.slice(4), 'base64'));
      } catch {
        return '';
      }
    }
    return txt;
  }

  ler() {
    const bruto = lerComReserva(this.arquivo, (j) => j && typeof j === 'object' && !Array.isArray(j)) || {};
    const cfg = { ...PADRAO, ...bruto, google: { ...PADRAO.google, ...(bruto.google || {}) } };
    for (const k of SECRETOS) cfg[k] = this.decifrar(cfg[k]);
    cfg.google.clientSecret = this.decifrar(cfg.google.clientSecret);
    return cfg;
  }

  salvar(novo) {
    const atual = this.ler();
    const cfg = { ...atual, ...novo, google: { ...atual.google, ...(novo.google || {}) } };
    const gravar = { ...cfg, google: { ...cfg.google } };
    for (const k of SECRETOS) gravar[k] = this.cifrar(cfg[k]);
    gravar.google.clientSecret = this.cifrar(cfg.google.clientSecret);
    gravarSeguro(this.arquivo, JSON.stringify(gravar, null, 1));
    return cfg;
  }

  // Versão para a tela: não devolve as chaves inteiras
  paraTela() {
    const c = this.ler();
    const mascarar = (v) => (v ? `••••${v.slice(-4)}` : '');
    return {
      ...c,
      falKey: mascarar(c.falKey),
      groqKey: mascarar(c.groqKey),
      claudeKey: mascarar(c.claudeKey),
      centralToken: mascarar(c.centralToken),
      temCentral: !!c.centralToken,
      google: { ...c.google, clientSecret: mascarar(c.google.clientSecret) },
      temFal: !!c.falKey,
      temGroq: !!c.groqKey,
      temClaude: !!c.claudeKey,
      temGoogle: !!(c.google.clientId && c.google.clientSecret),
    };
  }

  canais() {
    return lerComReserva(this.arquivoCanais, Array.isArray) || [];
  }

  canaisParaTela() {
    return this.canais().map(({ refreshToken, ...resto }) => resto);
  }

  canal(id) {
    const c = this.canais().find((x) => x.id === id);
    return c ? { ...c, refreshToken: this.decifrar(c.refreshToken) } : null;
  }

  salvarCanal({ canal, refreshToken, redirect }) {
    const lista = this.canais().filter((c) => c.id !== canal.id);
    lista.push({ ...canal, redirect: redirect || '', refreshToken: this.cifrar(refreshToken), conectadoEm: new Date().toISOString() });
    gravarSeguro(this.arquivoCanais, JSON.stringify(lista, null, 1));
  }

  removerCanal(id) {
    gravarSeguro(this.arquivoCanais, JSON.stringify(this.canais().filter((c) => c.id !== id), null, 1));
  }
}

module.exports = { Store };
