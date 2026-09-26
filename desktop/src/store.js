// Configurações e canais salvos no PC. Chaves e tokens ficam criptografados
// com a proteção do próprio Windows (safeStorage).
const fs = require('fs');
const path = require('path');

const PADRAO = {
  falKey: '',
  groqKey: '',
  google: { clientId: '', clientSecret: '', redirectOriginal: '' },
  modo: 'normal', // leve | normal | maximo
  simultaneos: 1,
  encoder: 'auto',
  pastaSaida: '',
  ultimoProjeto: null,
};

const SECRETOS = ['falKey', 'groqKey'];

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
    let bruto = {};
    try {
      bruto = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    } catch {}
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
    fs.writeFileSync(this.arquivo, JSON.stringify(gravar, null, 1));
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
      google: { ...c.google, clientSecret: mascarar(c.google.clientSecret) },
      temFal: !!c.falKey,
      temGroq: !!c.groqKey,
      temGoogle: !!(c.google.clientId && c.google.clientSecret),
    };
  }

  canais() {
    try {
      return JSON.parse(fs.readFileSync(this.arquivoCanais, 'utf8'));
    } catch {
      return [];
    }
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
    fs.writeFileSync(this.arquivoCanais, JSON.stringify(lista, null, 1));
  }

  removerCanal(id) {
    fs.writeFileSync(this.arquivoCanais, JSON.stringify(this.canais().filter((c) => c.id !== id), null, 1));
  }
}

module.exports = { Store };
