// Usado pelo workflow separar.yml
//   node salvar-separacao.mjs status <rodando|erro>
//   node salvar-separacao.mjs pronto <instrumental.mp3> <voz.mp3>
// Cada status vira um arquivo novo (cover/jobs/<id>/<status>.json), sem sobrescrever nada.
import { createRequire } from 'module';
import fs from 'fs/promises';

const require = createRequire('/tmp/up/');
const { put } = require('@vercel/blob');

const token = process.env.BLOB_TOKEN;
const jobId = process.env.JOB_ID;
const titulo = (process.env.TITULO || 'Música separada').slice(0, 100);
if (!token) { console.error('Falta o segredo MEDIA_READ_WRITE_TOKEN no GitHub.'); process.exit(1); }
if (!/^[a-z0-9]+$/i.test(jobId || '')) { console.error('jobId inválido.'); process.exit(1); }

async function salvarJson(caminho, dados) {
  await put(caminho, JSON.stringify(dados), { access: 'public', contentType: 'application/json', addRandomSuffix: false, token });
}

const [acao, a1, a2] = process.argv.slice(2);

if (acao === 'status') {
  if (!/^[a-z0-9-]+$/i.test(a1 || '')) { console.error('status inválido'); process.exit(1); }
  await salvarJson(`cover/jobs/${jobId}/${a1}.json`, { status: a1, em: Date.now() });
  console.log('status:', a1);
} else if (acao === 'pronto') {
  const enviar = async (caminho, arquivo) => {
    const dados = await fs.readFile(arquivo);
    return put(caminho, dados, { access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true, token, multipart: dados.length > 50 * 1024 * 1024 });
  };
  const i = await enviar(`cover/resultados/${jobId}/instrumental.mp3`, a1);
  const v = await enviar(`cover/resultados/${jobId}/voz.mp3`, a2);
  const projeto = { id: jobId, tipo: 'separar', gratis: true, titulo, instrumentalUrl: i.url, vozUrl: v.url, criadoEm: Date.now() };
  await salvarJson(`cover/projetos/${jobId}.json`, projeto);
  await salvarJson(`cover/jobs/${jobId}/pronto.json`, { status: 'pronto', projeto, em: Date.now() });
  console.log('pronto');
} else {
  console.error('uso: status <x> | pronto <inst> <voz>');
  process.exit(1);
}
