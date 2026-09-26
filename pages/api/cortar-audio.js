// Corta um trecho curto do começo de um áudio e recodifica em bitrate baixo,
// pra caber nos limites de tamanho que alguns modelos de IA exigem (o
// kling-lip-sync, por exemplo, só aceita áudio de até 5MB). Roda o corte
// aqui mesmo no servidor com ffmpeg, sem precisar editar o arquivo na mão.
//
// POST { audioUrl, segundos, inicio }  -> { url, segundos, inicio }
// "inicio" (em segundos) deixa pular a introdução instrumental e cortar já
// em cima do trecho com voz.

import { put } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
export const config = { maxDuration: 120 };

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

  const { audioUrl } = req.body || {};
  if (!audioUrl || !/^https:\/\//.test(audioUrl)) return res.status(400).json({ erro: 'Faltou a URL do áudio.' });

  // Trava entre 2 e 10s (limite do kling-lip-sync pro vídeo base).
  const segundos = Math.max(2, Math.min(10, Number(req.body?.segundos) || 8));
  const inicio = Math.max(0, Number(req.body?.inicio) || 0);

  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'corte-'));
  try {
    const entrada = path.join(pasta, 'entrada');
    const r = await fetch(audioUrl);
    if (!r.ok) throw new Error(`Não consegui baixar o áudio (${r.status}).`);
    await fs.writeFile(entrada, Buffer.from(await r.arrayBuffer()));

    const saida = path.join(pasta, 'corte.mp3');
    // Mono, 96kbps — um corte de até 10s fica bem abaixo de 1MB, com folga
    // enorme do limite de 5MB, mas ainda com qualidade suficiente pro teste.
    await rodarFfmpeg([
      '-ss', String(inicio),
      '-i', entrada,
      '-t', String(segundos),
      '-ac', '1',
      '-c:a', 'libmp3lame', '-b:a', '96k',
      saida,
    ]);

    const buffer = await fs.readFile(saida);
    const blob = await put(`cantor-virtual/cortes/${Date.now()}-corte.mp3`, buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      addRandomSuffix: true,
      token: BLOB_TOKEN,
    });

    return res.status(200).json({ url: blob.url, segundos, inicio, tamanhoBytes: buffer.length });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  } finally {
    fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
