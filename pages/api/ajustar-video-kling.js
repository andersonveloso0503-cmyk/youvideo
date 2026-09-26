// Ajusta um vídeo pra caber nos limites exigidos pelo kling-lip-sync:
// largura entre 512px e 2160px, e duração de até 10s. Roda aqui no
// servidor com ffmpeg, sem precisar editar o vídeo na mão.
//
// POST { videoUrl, segundos }  -> { url, segundos }

import { put } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
export const config = { maxDuration: 180 };

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!BLOB_TOKEN) return res.status(500).json({ erro: 'MEDIA_READ_WRITE_TOKEN não está configurado na Vercel.' });

  const { videoUrl } = req.body || {};
  if (!videoUrl || !/^https:\/\//.test(videoUrl)) return res.status(400).json({ erro: 'Faltou a URL do vídeo.' });

  // Trava entre 2 e 10s (limite do kling-lip-sync).
  const segundos = Math.max(2, Math.min(10, Number(req.body?.segundos) || 8));

  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'video-'));
  try {
    const entrada = path.join(pasta, 'entrada.mp4');
    const r = await fetch(videoUrl);
    if (!r.ok) throw new Error(`Não consegui baixar o vídeo (${r.status}).`);
    await fs.writeFile(entrada, Buffer.from(await r.arrayBuffer()));

    const saida = path.join(pasta, 'ajustado.mp4');
    // "min(max(iw,720),1920)" garante largura entre 720 e 1920 (dentro dos
    // 512-2160 exigidos, com folga), -2 na altura mantém a proporção com
    // número par (exigência do codec). -t corta pro tamanho máximo aceito.
    await rodarFfmpeg([
      '-i', entrada,
      '-t', String(segundos),
      '-vf', "scale='min(max(iw,720),1920)':-2",
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      saida,
    ]);

    const buffer = await fs.readFile(saida);
    const blob = await put(`cantor-virtual/videos-ajustados/${Date.now()}-video.mp4`, buffer, {
      access: 'public',
      contentType: 'video/mp4',
      addRandomSuffix: true,
      token: BLOB_TOKEN,
    });

    return res.status(200).json({ url: blob.url, segundos, tamanhoBytes: buffer.length });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  } finally {
    fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
