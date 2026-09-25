// Junta a voz nova com o instrumental e salva os 3 arquivos (cover, instrumental, voz) no Vercel Blob
// POST { vozUrl, instrumentosUrls: [...], volumeVoz, titulo, vozNome, estilo } -> { projeto }
// GET  -> { projetos: [...] }   (histórico de covers gerados)

import { put, list } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

export const config = { maxDuration: 300 };

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path;
const PREFIXO = 'cover/projetos/';

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

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PREFIXO, limit: 1000 });
      const recentes = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 50);
      const projetos = await Promise.all(recentes.map(async (b) => {
        try { return await (await fetch(b.url, { cache: 'no-store' })).json(); } catch { return null; }
      }));
      return res.status(200).json({ projetos: projetos.filter(Boolean) });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

    const { vozUrl, instrumentosUrls, volumeVoz, titulo, vozNome, estilo } = req.body || {};
    if (!vozUrl || !Array.isArray(instrumentosUrls) || !instrumentosUrls.length) {
      return res.status(400).json({ erro: 'Faltou a voz nova ou o instrumental.' });
    }
    const vol = Math.max(0.3, Math.min(2, Number(volumeVoz) || 1));

    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-'));
    try {
      const arqVoz = path.join(pasta, 'voz_in');
      const arqsInst = instrumentosUrls.map((_, i) => path.join(pasta, `inst_${i}`));
      await Promise.all([baixar(vozUrl, arqVoz), ...instrumentosUrls.map((u, i) => baixar(u, arqsInst[i]))]);

      const saidaCover = path.join(pasta, 'cover.mp3');
      const saidaInst = path.join(pasta, 'instrumental.mp3');
      const saidaVoz = path.join(pasta, 'voz.mp3');

      const fmt = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
      const n = arqsInst.length;
      let filtro = `[0:a]${fmt},volume=${vol},asplit=2[v][vout];`;
      filtro += arqsInst.map((_, i) => `[${i + 1}:a]${fmt}[a${i}];`).join('');
      if (n === 1) filtro += `[a0]anull[inst];`;
      else filtro += `${arqsInst.map((_, i) => `[a${i}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest[inst];`;
      filtro += `[inst]asplit=2[i1][i2];`;
      filtro += `[v][i1]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95[mix];`;
      filtro += `[i2]alimiter=limit=0.95[instout]`;

      const mp3 = ['-c:a', 'libmp3lame', '-b:a', '192k'];
      await rodarFfmpeg([
        '-i', arqVoz, ...arqsInst.flatMap((a) => ['-i', a]),
        '-filter_complex', filtro,
        '-map', '[mix]', ...mp3, saidaCover,
        '-map', '[instout]', ...mp3, saidaInst,
        '-map', '[vout]', ...mp3, saidaVoz,
      ]);

      const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const base = `cover/resultados/${id}`;
      const opts = { access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true };
      const [c, i, v] = await Promise.all([
        put(`${base}/cover.mp3`, await fs.readFile(saidaCover), opts),
        put(`${base}/instrumental.mp3`, await fs.readFile(saidaInst), opts),
        put(`${base}/voz.mp3`, await fs.readFile(saidaVoz), opts),
      ]);

      const projeto = {
        id,
        titulo: titulo ? String(titulo).slice(0, 100) : 'Cover sem título',
        vozNome: vozNome || '',
        estilo: estilo || '',
        coverUrl: c.url,
        instrumentalUrl: i.url,
        vozUrl: v.url,
        criadoEm: Date.now(),
      };
      await put(`${PREFIXO}${id}.json`, JSON.stringify(projeto), {
        access: 'public', contentType: 'application/json', addRandomSuffix: false,
      });
      return res.status(200).json({ projeto });
    } finally {
      fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
    }
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
