// Biblioteca de Vozes do Cover IA (salva no Vercel Blob)
// GET                                   -> { vozes: [...] }
// POST { etapa: 'preparar', audioUrl }  -> { amostraUrl, datasetUrl, segundos }
//      (limpa a voz, cria uma amostra de 25s para ouvir e o pacote de treino RVC em trechos de 10s)
// POST { etapa: 'salvar', nome, estilo, presetId, descricao, origem, amostraUrl, modeloTempUrl }
//      -> { voz }  (copia o modelo treinado para o Blob, porque o link do Replicate expira)
// DELETE ?id=...                        -> { ok: true }

import { put, list, del } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
export const config = { maxDuration: 300 };

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path;
const PREFIXO = 'cover/vozes/meta/';

function rodarFfmpeg(args) {
  return new Promise((ok, falha) => {
    const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok() : falha(new Error('ffmpeg: ' + err.slice(-600)))));
  });
}

// ── ZIP simples (sem compressão), suficiente para o pacote de treino
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function criarZip(arquivos) {
  const partes = []; const central = []; let offset = 0;
  for (const { nome, dados } of arquivos) {
    const n = Buffer.from(nome, 'utf8'); const crc = crc32(dados);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0, 6); loc.writeUInt16LE(0, 8);
    loc.writeUInt16LE(0, 10); loc.writeUInt16LE(0x21, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(dados.length, 18); loc.writeUInt32LE(dados.length, 22); loc.writeUInt16LE(n.length, 26); loc.writeUInt16LE(0, 28);
    partes.push(loc, n, dados);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(dados.length, 20);
    cen.writeUInt32LE(dados.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(0, 30); cen.writeUInt32LE(0, 34);
    cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    central.push(cen, n);
    offset += 30 + n.length + dados.length;
  }
  const cBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cBuf.length, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, cBuf, fim]);
}

async function baixar(url, destino) {
  if (!/^https:\/\//.test(url)) throw new Error('URL inválida.');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Não consegui baixar o arquivo (${r.status}).`);
  await fs.writeFile(destino, Buffer.from(await r.arrayBuffer()));
}

async function listarVozes() {
  const { blobs } = await list({ prefix: PREFIXO, limit: 1000, token: BLOB_TOKEN });
  const vozes = await Promise.all(blobs.map(async (b) => {
    try { return await (await fetch(b.url, { cache: 'no-store' })).json(); } catch { return null; }
  }));
  return vozes.filter(Boolean).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return res.status(200).json({ vozes: await listarVozes() });

    if (req.method === 'POST' && req.body?.etapa === 'preparar') {
      const { audioUrl } = req.body;
      const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'voz-'));
      try {
        const entrada = path.join(pasta, 'entrada');
        await baixar(audioUrl, entrada);

        // voz limpa: tira todos os silêncios longos, nivela volume, 48 kHz mono
        const limpa = path.join(pasta, 'limpa.wav');
        await rodarFfmpeg([
          '-i', entrada,
          '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB,loudnorm=I=-16:TP=-1.5',
          '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', limpa,
        ]);

        // amostra para ouvir (25s)
        const amostra = path.join(pasta, 'amostra.mp3');
        await rodarFfmpeg(['-i', limpa, '-t', '25', '-c:a', 'libmp3lame', '-b:a', '160k', amostra]);

        // trechos de 10s para o treino (máx. 10 minutos)
        const pastaTrechos = path.join(pasta, 'trechos');
        await fs.mkdir(pastaTrechos);
        await rodarFfmpeg(['-i', limpa, '-t', '600', '-f', 'segment', '-segment_time', '10', '-c:a', 'pcm_s16le', path.join(pastaTrechos, 'split_%d.wav')]);
        const nomes = (await fs.readdir(pastaTrechos)).filter((n) => n.endsWith('.wav'));
        const trechos = [];
        for (const n of nomes) {
          const dados = await fs.readFile(path.join(pastaTrechos, n));
          if (dados.length > 48000 * 2 * 2) trechos.push({ nome: `dataset/voz/${n}`, dados }); // ignora trechos < 2s
        }
        const segundos = Math.round(trechos.reduce((s, t) => s + t.dados.length, 0) / (48000 * 2));
        if (segundos < 20) throw new Error(`Voz muito curta para treinar (${segundos}s). Use um áudio com pelo menos 30 segundos cantados.`);

        const opts = { access: 'public', addRandomSuffix: true, token: BLOB_TOKEN };
        const [a, z] = await Promise.all([
          put('cover/vozes/amostras/amostra.mp3', await fs.readFile(amostra), { ...opts, contentType: 'audio/mpeg' }),
          put('cover/vozes/treino/dataset.zip', criarZip(trechos), { ...opts, contentType: 'application/zip' }),
        ]);
        return res.status(200).json({ amostraUrl: a.url, datasetUrl: z.url, segundos });
      } finally {
        fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    }

    if (req.method === 'POST' && req.body?.etapa === 'salvar') {
      const { nome, estilo, presetId, descricao, origem, amostraUrl, modeloTempUrl, datasetUrl } = req.body;
      if (!nome || !estilo || !amostraUrl || !modeloTempUrl) return res.status(400).json({ erro: 'Faltou dado da voz.' });

      const r = await fetch(modeloTempUrl);
      if (!r.ok) throw new Error(`Não consegui baixar o modelo treinado (${r.status}).`);
      const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const modelo = await put(`cover/vozes/modelos/voz${id}.zip`, Buffer.from(await r.arrayBuffer()), {
        access: 'public', contentType: 'application/zip', addRandomSuffix: false, token: BLOB_TOKEN,
      });

      const voz = {
        id,
        nome: String(nome).slice(0, 60),
        estilo,
        presetId: presetId || null,
        descricao: descricao ? String(descricao).slice(0, 300) : '',
        origem: origem || 'gerada',
        amostraUrl,
        modeloUrl: modelo.url,
        criadoEm: Date.now(),
      };
      await put(`${PREFIXO}${id}.json`, JSON.stringify(voz), {
        access: 'public', contentType: 'application/json', addRandomSuffix: false, token: BLOB_TOKEN,
      });
      if (datasetUrl) del([datasetUrl], { token: BLOB_TOKEN }).catch(() => {});
      return res.status(200).json({ voz });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || !/^[a-z0-9]+$/i.test(id)) return res.status(400).json({ erro: 'id inválido.' });
      const { blobs } = await list({ prefix: `${PREFIXO}${id}`, token: BLOB_TOKEN });
      if (!blobs.length) return res.status(404).json({ erro: 'Voz não encontrada.' });
      const meta = await (await fetch(blobs[0].url, { cache: 'no-store' })).json().catch(() => ({}));
      await del([blobs[0].url, meta.amostraUrl, meta.modeloUrl].filter(Boolean), { token: BLOB_TOKEN });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
