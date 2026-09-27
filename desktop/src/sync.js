// Leva as configurações (chaves e canais do YouTube) de um PC para outro pela Central.
// Tudo é criptografado AQUI, com a senha da Central (AES-256-GCM + scrypt), antes de sair do PC.
const crypto = require('crypto');
const Central = require('./engine/central');

const CAMPOS = ['falKey', 'groqKey', 'google', 'envioPrefs', 'modo', 'simultaneos', 'encoder'];

function cifrar(obj, senha) {
  const sal = crypto.randomBytes(16);
  const chave = crypto.scryptSync(senha, sal, 32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return ['v1', sal, iv, c.getAuthTag(), dados].map((x) => (typeof x === 'string' ? x : x.toString('base64'))).join('.');
}

function decifrar(texto, senha) {
  const [v, sal, iv, tag, dados] = String(texto).split('.');
  if (v !== 'v1') throw new Error('Formato desconhecido.');
  const b = (x) => Buffer.from(x, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(senha, b(sal), 32), b(iv));
  d.setAuthTag(b(tag));
  return JSON.parse(Buffer.concat([d.update(b(dados)), d.final()]).toString('utf8'));
}

/** Envia as configurações deste PC para a nuvem. */
async function enviar(store) {
  const cfg = store.ler();
  if (!cfg.centralToken) return { ok: false, motivo: 'sem-central' };
  const pacote = { config: {}, canais: [], em: new Date().toISOString() };
  for (const k of CAMPOS) if (cfg[k] !== undefined) pacote.config[k] = cfg[k];
  pacote.canais = store.canais().map((c) => ({ ...c, refreshToken: store.canal(c.id)?.refreshToken || '' }));
  await Central.chamar(cfg, '/api/central/config', { metodo: 'PUT', corpo: { dados: cifrar(pacote, cfg.centralToken) } });
  return { ok: true, em: pacote.em };
}

/** Puxa as configurações da nuvem para este PC. */
async function puxar(store) {
  const cfg = store.ler();
  if (!cfg.centralToken) throw new Error('Cole a senha da Central primeiro.');
  const r = await Central.chamar(cfg, '/api/central/config');
  if (!r?.dados) return { ok: false, motivo: 'vazio' };
  let pacote;
  try {
    pacote = decifrar(r.dados, cfg.centralToken);
  } catch {
    throw new Error('Não consegui abrir as configurações salvas — a senha da Central é a mesma do outro PC?');
  }
  const novo = {};
  for (const k of CAMPOS) {
    const v = pacote.config?.[k];
    if (v === undefined || v === '' || v === null) continue;
    novo[k] = v;
  }
  store.salvar(novo);
  for (const c of pacote.canais || []) {
    if (!c.refreshToken) continue;
    const { refreshToken, redirect, ...canal } = c;
    store.salvarCanal({ canal, refreshToken, redirect });
  }
  return { ok: true, canais: (pacote.canais || []).length, em: pacote.em };
}

module.exports = { enviar, puxar, cifrar, decifrar };
