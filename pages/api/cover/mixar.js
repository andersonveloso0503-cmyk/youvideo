// Salva o resultado no Vercel Blob e guarda o histórico
// POST { coverTempUrl, titulo, vozNome, estilo }                 -> { projeto }  (cover com voz nova)
// POST { tipo: 'separar', vozUrl, instrumentosUrls, titulo }     -> { projeto }  (só separar voz e instrumental)
// GET  -> { projetos: [...] }

import { put, list } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
export const config = { maxDuration: 300 };

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path;

function rodarFfmpeg(args) {
  return new Promise((ok, falha) => {
    const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok() : falha(new Error('ffmpeg: ' + err.slice(-600)))));
  });
}

async function baixar(url, destino) {
  if (!/^https:\/\//.test(url)) throw new Error('URL de áudio inválida.');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Não consegui baixar um dos áudios (${r.status}).`);
  await fs.writeFile(destino, Buffer.from(await r.arrayBuffer()));
}

async function salvarProjeto(projeto) {
  await put(`${PREFIXO}${projeto.id}.json`, JSON.stringify(projeto), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false, token: BLOB_TOKEN,
  });
}

// junta os instrumentos separados (bateria, baixo, etc.) num instrumental só e salva voz + instrumental
async function separarESalvar({ vozUrl, instrumentosUrls, titulo }) {
  if (!vozUrl || !Array.isArray(instrumentosUrls) || !instrumentosUrls.length) throw new Error('Faltou a voz ou o instrumental.');
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'sep-'));
  try {
    const arqVoz = path.join(pasta, 'voz_in');
    const arqsInst = instrumentosUrls.map((_, i) => path.join(pasta, `inst_${i}`));
    await Promise.all([baixar(vozUrl, arqVoz), ...instrumentosUrls.map((u, i) => baixar(u, arqsInst[i]))]);

    const saidaInst = path.join(pasta, 'instrumental.mp3');
    const saidaVoz = path.join(pasta, 'voz.mp3');
    const fmt = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
    const n = arqsInst.length;
    let filtro = arqsInst.map((_, i) => `[${i}:a]${fmt}[a${i}];`).join('');
    filtro += n === 1 ? `[a0]alimiter=limit=0.95[inst]` : `${arqsInst.map((_, i) => `[a${i}]`).join('')}amix=inputs=${n}:duration=longest,volume=${n},alimiter=limit=0.95[inst]`;
    const mp3 = ['-c:a', 'libmp3lame', '-b:a', '192k'];
    await rodarFfmpeg([...arqsInst.flatMap((a) => ['-i', a]), '-filter_complex', filtro, '-map', '[inst]', ...mp3, saidaInst]);
    await rodarFfmpeg(['-i', arqVoz, ...mp3, saidaVoz]);

    const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const opts = { access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true, token: BLOB_TOKEN };
    const [i, v] = await Promise.all([
      put(`cover/resultados/${id}/instrumental.mp3`, await fs.readFile(saidaInst), opts),
      put(`cover/resultados/${id}/voz.mp3`, await fs.readFile(saidaVoz), opts),
    ]);
    const projeto = {
      id,
      tipo: 'separar',
      titulo: titulo ? String(titulo).slice(0, 100) : 'Música separada',
      instrumentalUrl: i.url,
      vozUrl: v.url,
      criadoEm: Date.now(),
    };
    await salvarProjeto(projeto);
    return projeto;
  } finally {
    fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

const PREFIXO = 'cover/projetos/';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PREFIXO, limit: 1000, token: BLOB_TOKEN });
      const recentes = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 50);
      const projetos = await Promise.all(recentes.map(async (b) => {
        try { return await (await fetch(b.url, { cache: 'no-store' })).json(); } catch { return null; }
      }));
      return res.status(200).json({ projetos: projetos.filter(Boolean) });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

    if (req.body?.tipo === 'separar') {
      return res.status(200).json({ projeto: await separarESalvar(req.body) });
    }

    const { coverTempUrl, titulo, vozNome, estilo } = req.body || {};
    if (!coverTempUrl || !/^https:\/\//.test(coverTempUrl)) return res.status(400).json({ erro: 'Faltou o áudio do cover.' });

    const r = await fetch(coverTempUrl);
    if (!r.ok) throw new Error(`Não consegui baixar o cover (${r.status}).`);
    const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const cover = await put(`cover/resultados/${id}/cover.mp3`, Buffer.from(await r.arrayBuffer()), {
      access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true, token: BLOB_TOKEN,
    });

    const projeto = {
      id,
      titulo: titulo ? String(titulo).slice(0, 100) : 'Cover sem título',
      vozNome: vozNome || '',
      estilo: estilo || '',
      coverUrl: cover.url,
      criadoEm: Date.now(),
    };
    await salvarProjeto(projeto);
    return res.status(200).json({ projeto });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
