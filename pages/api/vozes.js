// Biblioteca de Vozes do Cover IA (salva no Vercel Blob)
// GET              -> { vozes: [...] }
// POST { nome, estilo, presetId, descricao, audioUrl, origem } -> { voz }
//      (recorta ~25s de voz limpa, sem silêncio no começo, e salva como amostra)
// DELETE ?id=...   -> { ok: true }

import { put, list, del } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';

export const config = { maxDuration: 120 };

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic;
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

async function listarVozes() {
  const { blobs } = await list({ prefix: PREFIXO, limit: 1000 });
  const vozes = await Promise.all(blobs.map(async (b) => {
    try {
      const r = await fetch(b.url, { cache: 'no-store' });
      const v = await r.json();
      return { ...v, metaUrl: b.url };
    } catch { return null; }
  }));
  return vozes.filter(Boolean).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ vozes: await listarVozes() });
    }

    if (req.method === 'POST') {
      const { nome, estilo, presetId, descricao, audioUrl, origem } = req.body || {};
      if (!nome || !estilo || !audioUrl || !/^https:\/\//.test(audioUrl)) {
        return res.status(400).json({ erro: 'Faltou nome, estilo ou áudio.' });
      }

      const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'voz-'));
      try {
        const entrada = path.join(pasta, 'entrada');
        const saida = path.join(pasta, 'amostra.mp3');
        const r = await fetch(audioUrl);
        if (!r.ok) throw new Error(`Não consegui baixar o áudio da voz (${r.status}).`);
        await fs.writeFile(entrada, Buffer.from(await r.arrayBuffer()));

        // tira o silêncio do começo, pega 25s (o Seed-VC usa os primeiros 25s) e nivela o volume
        await rodarFfmpeg([
          '-i', entrada,
          '-af', 'silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB,atrim=0:25,loudnorm=I=-16:TP=-1.5',
          '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', saida,
        ]);

        const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
        const amostra = await put(`cover/vozes/amostras/${id}.mp3`, await fs.readFile(saida), {
          access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true,
        });

        const voz = {
          id,
          nome: String(nome).slice(0, 60),
          estilo,
          presetId: presetId || null,
          descricao: descricao ? String(descricao).slice(0, 300) : '',
          origem: origem || 'gerada',
          amostraUrl: amostra.url,
          criadoEm: Date.now(),
        };
        await put(`${PREFIXO}${id}.json`, JSON.stringify(voz), {
          access: 'public', contentType: 'application/json', addRandomSuffix: false,
        });
        return res.status(200).json({ voz });
      } finally {
        fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
      }
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || !/^[a-z0-9]+$/i.test(id)) return res.status(400).json({ erro: 'id inválido.' });
      const { blobs } = await list({ prefix: `${PREFIXO}${id}` });
      if (!blobs.length) return res.status(404).json({ erro: 'Voz não encontrada.' });
      const meta = await (await fetch(blobs[0].url, { cache: 'no-store' })).json().catch(() => ({}));
      await del([blobs[0].url, meta.amostraUrl].filter(Boolean));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
