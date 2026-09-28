// Estúdio de Música — junta várias músicas numa faixa só (medley) com transição suave
// POST { titulo, faixas: [{ id, titulo, audioUrl, letra, estilo }], crossfade } -> { musica }

import { put } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getDb } from '../../../lib/firebase-admin';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } };

const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path;
const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

function rodarFfmpeg(args) {
  return new Promise((ok, falha) => {
    const p = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', falha);
    p.on('close', (c) => (c === 0 ? ok() : falha(new Error('ffmpeg: ' + err.slice(-600)))));
  });
}

function duracaoDe(arquivo) {
  // ffmpeg -i sem saída escreve "Duration: 00:03:12.34" no stderr
  return new Promise((ok) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-i', arquivo]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      ok(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
    p.on('error', () => ok(0));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const { titulo, faixas } = req.body || {};
  const lista = (Array.isArray(faixas) ? faixas : []).filter((f) => f && /^https:\/\//.test(f.audioUrl || ''));
  if (lista.length < 2) return res.status(400).json({ erro: 'Escolha pelo menos 2 músicas para juntar.' });
  if (lista.length > 15) return res.status(400).json({ erro: 'Máximo de 15 músicas por medley.' });
  const cf = Math.max(0, Math.min(8, Number(req.body.crossfade) || 3));

  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'medley-'));
  try {
    const arquivos = [];
    for (let i = 0; i < lista.length; i++) {
      const r = await fetch(lista[i].audioUrl);
      if (!r.ok) throw new Error(`Não consegui baixar a música ${i + 1} (${r.status}).`);
      const f = path.join(pasta, `f${i}`);
      await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
      arquivos.push(f);
    }

    // Normaliza todas para o mesmo formato e encadeia com crossfade
    const entradas = arquivos.flatMap((f) => ['-i', f]);
    const partes = arquivos.map((_, i) => `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[n${i}]`);
    let atual = 'n0';
    for (let i = 1; i < arquivos.length; i++) {
      const saidaLabel = i === arquivos.length - 1 ? 'fim' : `x${i}`;
      partes.push(cf > 0
        ? `[${atual}][n${i}]acrossfade=d=${cf}:c1=tri:c2=tri[${saidaLabel}]`
        : `[${atual}][n${i}]concat=n=2:v=0:a=1[${saidaLabel}]`);
      atual = saidaLabel;
    }
    partes.push('[fim]loudnorm=I=-14:TP=-1.5:LRA=11[out]');

    const saida = path.join(pasta, 'medley.mp3');
    await rodarFfmpeg([...entradas, '-filter_complex', partes.join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', saida]);

    const duracaoSeg = Math.round(await duracaoDe(saida));
    const blob = await put(`estudio-musica/medleys/${Date.now()}.mp3`, await fs.readFile(saida), {
      access: 'public',
      contentType: 'audio/mpeg',
      token: BLOB_TOKEN,
      addRandomSuffix: true,
    });

    const musica = {
      tipo: 'medley',
      titulo: String(titulo || '').trim() || `Medley com ${lista.length} músicas`,
      motor: 'medley',
      modelo: '',
      modo: 'medley',
      descricao: lista.map((f, i) => `${i + 1}. ${f.titulo || 'Música'}`).join(' · '),
      letra: lista.map((f) => (f.letra ? `### ${f.titulo || ''}\n${f.letra}` : '')).filter(Boolean).join('\n\n'),
      estilo: [...new Set(lista.map((f) => f.estiloNome || '').filter(Boolean))].join(', '),
      voz: '',
      instrumental: false,
      duracaoSeg,
      audioUrl: blob.url,
      capaUrl: '',
      favorito: false,
      faixas: lista.map((f) => ({
        id: f.id || '',
        titulo: f.titulo || '',
        audioUrl: f.audioUrl,
        letra: f.letra || '',
        estiloNome: f.estiloNome || '',
        ritmoNome: f.ritmoNome || '',
        ideiasNomes: Array.isArray(f.ideiasNomes) ? f.ideiasNomes.slice(0, 30) : [],
      })),
      criadoEm: new Date().toISOString(),
    };
    const ref = await getDb().collection('youvideo_estudio_musicas').add(musica);
    return res.status(200).json({ musica: { id: ref.id, ...musica } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  } finally {
    fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
