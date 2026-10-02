// Estúdio de Música — aumentar uma música já pronta (mesmo áudio + trecho novo no final).
// Usa o "inpainting" da ElevenLabs: envia o áudio, mantém o começo como está e gera só o que falta.
//
// GET ?teste=1 -> confere, com um trecho de 12 s, se a conta da ElevenLabs tem acesso ao recurso.

import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getDb } from '../../../lib/firebase-admin';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '1mb' } } };

const COL = 'youvideo_estudio_musicas';
const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path;
const API = 'https://api.elevenlabs.io/v1/music';

function rodarFfmpeg(args) {
  return new Promise((ok, falha) => {
    const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok() : falha(new Error('ffmpeg: ' + err.slice(-600)))));
  });
}

async function enviarParaElevenLabs(key, buffer, nome) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'audio/mpeg' }), nome);
  fd.append('extract_composition_plan', 'music_v2_5');
  fd.append('with_waveform_visual', 'true');
  return fetch(`${API}/upload`, { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
}

export default async function handler(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(500).json({ erro: 'ELEVENLABS_API_KEY não está configurada na Vercel.' });

  if (req.method === 'GET' && req.query.teste) {
    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'aumentar-'));
    try {
      const snap = await getDb().collection(COL).orderBy('criadoEm', 'desc').limit(30).get();
      const m = snap.docs.map((d) => d.data()).find((x) => x.motor === 'elevenlabs' && x.tipo !== 'medley' && /^https:\/\//.test(x.audioUrl || ''));
      if (!m) return res.status(200).json({ erro: 'sem música da ElevenLabs na biblioteca para testar' });
      const r = await fetch(m.audioUrl);
      const inteiro = path.join(pasta, 'a.mp3');
      const trecho = path.join(pasta, 't.mp3');
      await fs.writeFile(inteiro, Buffer.from(await r.arrayBuffer()));
      await rodarFfmpeg(['-i', inteiro, '-t', '12', '-c:a', 'libmp3lame', '-b:a', '128k', trecho]);
      const up = await enviarParaElevenLabs(key, await fs.readFile(trecho), 'trecho.mp3');
      const corpoUp = await up.text();
      const saida = { envio: { status: up.status, corpo: corpoUp.slice(0, 2500) } };
      let songId = '';
      try { songId = JSON.parse(corpoUp).song_id || ''; } catch { /* não é json */ }
      if (up.ok && songId) {
        const plano = {
          chunks: [
            { song_id: songId, range: { start_ms: 0, end_ms: 8000 } },
            {
              text: '[Outro]',
              duration_ms: 3000,
              positive_styles: ['soft ending'],
              negative_styles: [],
              context_adherence: 'high',
              conditioning_ref: { song_id: songId, range: { start_ms: 0, end_ms: 8000 } },
              condition_strength: 'high',
            },
          ],
        };
        const c = await fetch(`${API}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ composition_plan: plano, model_id: process.env.ELEVENLABS_MUSIC_MODEL || 'music_v2_5' }),
        });
        const tipo = c.headers.get('content-type') || '';
        saida.composicao = { status: c.status, tipo };
        if (c.ok) saida.composicao.bytes = (await c.arrayBuffer()).byteLength;
        else saida.composicao.corpo = (await c.text()).slice(0, 1500);
      }
      return res.status(200).json(saida);
    } catch (e) {
      return res.status(200).json({ erro: e.message });
    } finally {
      await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
    }
  }

  return res.status(405).json({ erro: 'Método não permitido.' });
}
