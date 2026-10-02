// Estúdio de Música — aumentar uma música já pronta: o áudio original fica como está e a IA gera
// só o trecho novo (refrão final, estrofe, solo) antes do encerramento.
// Usa o "inpainting" da ElevenLabs: envia o áudio, mantém o começo e compõe o que falta.
//
// POST { id, extraSeg }   -> { musica }  (cria uma versão nova; a original continua na biblioteca)
// GET  ?teste=1           -> testa o recurso com um trecho de 12 s e guarda o resultado
// GET  ?teste=ver         -> mostra o resultado do último teste

import { put } from '@vercel/blob';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getDb } from '../../../lib/firebase-admin';
import { montarPlano, trechosDoPlano } from '../../../lib/aumentar';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '1mb' } } };

const COL = 'youvideo_estudio_musicas';
const FFMPEG = process.env.FFMPEG_PATH || ffmpegInstaller.path;
const API = 'https://api.elevenlabs.io/v1/music';
const MODELO = () => process.env.ELEVENLABS_MUSIC_MODEL || 'music_v2_5';

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

function mensagemDaElevenLabs(txt) {
  try {
    const j = JSON.parse(txt);
    const d = j.detail;
    return (d && (d.message || d.status)) || (typeof d === 'string' ? d : '') || (Array.isArray(d) ? d.map((x) => x.msg).join('; ') : '') || txt;
  } catch {
    return txt;
  }
}

function erroAmigavel(status, txt, etapa) {
  const msg = String(mensagemDaElevenLabs(txt)).slice(0, 300);
  if (status === 401 || status === 403 || /enterprise|not available|not enabled|no access|permission|inpaint/i.test(msg)) {
    return `A ElevenLabs não liberou o recurso de aumentar música nesta conta (${etapa}): ${msg}. Esse recurso pode ser exclusivo do plano Enterprise. Use "Editar e recriar" com a duração maior.`;
  }
  if (status === 402 || /quota|credit/i.test(msg)) return `ElevenLabs sem crédito suficiente (${etapa}): ${msg}`;
  return `ElevenLabs (${etapa}): ${msg}`;
}

async function enviarParaElevenLabs(key, buffer, nome) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'audio/mpeg' }), nome);
  fd.append('extract_composition_plan', MODELO());
  return fetch(`${API}/upload`, { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
}

async function compor(key, plano) {
  for (let vez = 0; ; vez++) {
    const r = await fetch(`${API}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition_plan: plano, model_id: MODELO() }),
    });
    if (r.status !== 429 || vez >= 8) return r;
    const txt = await r.clone().text();
    if (!/concurrent|too many|rate/i.test(txt)) return r;
    await new Promise((ok) => setTimeout(ok, 12000 + Math.random() * 6000));
  }
}

async function guardarTeste(dados) {
  try { await getDb().collection('youvideo_config').doc('aumentar_teste').set({ ...dados, em: new Date().toISOString() }); } catch { /* só diagnóstico */ }
}

export default async function handler(req, res) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(500).json({ erro: 'ELEVENLABS_API_KEY não está configurada na Vercel.' });

  if (req.method === 'GET' && req.query.teste === 'ver') {
    const d = await getDb().collection('youvideo_config').doc('aumentar_teste').get();
    return res.status(200).json(d.exists ? d.data() : { vazio: true });
  }

  if (req.method === 'GET' && req.query.teste) {
    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'aumentar-'));
    const saida = { fase: 'inicio' };
    try {
      await guardarTeste(saida);
      const snap = await getDb().collection(COL).orderBy('criadoEm', 'desc').limit(30).get();
      const m = snap.docs.map((d) => d.data()).find((x) => x.motor === 'elevenlabs' && x.tipo !== 'medley' && /^https:\/\//.test(x.audioUrl || ''));
      if (!m) { saida.erro = 'sem música da ElevenLabs para testar'; await guardarTeste(saida); return res.status(200).json(saida); }
      const r = await fetch(m.audioUrl);
      const inteiro = path.join(pasta, 'a.mp3');
      const trecho = path.join(pasta, 't.mp3');
      await fs.writeFile(inteiro, Buffer.from(await r.arrayBuffer()));
      await rodarFfmpeg(['-i', inteiro, '-t', '12', '-c:a', 'libmp3lame', '-b:a', '128k', trecho]);
      saida.fase = 'enviando';
      await guardarTeste(saida);
      const t0 = Date.now();
      const up = await enviarParaElevenLabs(key, await fs.readFile(trecho), 'trecho.mp3');
      const corpoUp = await up.text();
      saida.envio = { status: up.status, ms: Date.now() - t0, corpo: corpoUp.slice(0, 3500) };
      saida.fase = 'enviado';
      await guardarTeste(saida);
      let songId = '';
      try { songId = JSON.parse(corpoUp).song_id || ''; } catch { /* não é json */ }
      if (up.ok && songId) {
        const ref = { song_id: songId, range: { start_ms: 0, end_ms: 8000 } };
        const plano = {
          chunks: [
            ref,
            { text: '[Chorus]', duration_ms: 3000, positive_styles: ['same band'], negative_styles: [], context_adherence: 'high', conditioning_ref: ref, condition_strength: 'high' },
            { text: '[Outro]', duration_ms: 3000, positive_styles: ['soft ending'], negative_styles: [], context_adherence: 'high', conditioning_ref: ref, condition_strength: 'high' },
          ],
        };
        const t1 = Date.now();
        const c = await compor(key, plano);
        saida.composicao = { status: c.status, ms: Date.now() - t1, tipo: c.headers.get('content-type') || '' };
        if (c.ok) saida.composicao.bytes = (await c.arrayBuffer()).byteLength;
        else saida.composicao.corpo = (await c.text()).slice(0, 1500);
      }
      saida.fase = 'fim';
      await guardarTeste(saida);
      return res.status(200).json(saida);
    } catch (e) {
      saida.erro = e.message;
      await guardarTeste(saida);
      return res.status(200).json(saida);
    } finally {
      await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const { id } = req.body || {};
  const extraSeg = [30, 60, 90].includes(Number(req.body?.extraSeg)) ? Number(req.body.extraSeg) : 30;
  if (!id) return res.status(400).json({ erro: 'id faltando.' });

  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'aumentar-'));
  try {
    const db = getDb();
    const doc = await db.collection(COL).doc(String(id)).get();
    if (!doc.exists) return res.status(404).json({ erro: 'Música não encontrada.' });
    const m = doc.data();
    if (m.tipo === 'medley') return res.status(400).json({ erro: 'Medley não dá para aumentar. Junte mais uma música nele.' });
    if (!/^https:\/\//.test(m.audioUrl || '')) return res.status(400).json({ erro: 'Essa música está sem arquivo de áudio.' });

    const baixado = await fetch(m.audioUrl);
    if (!baixado.ok) throw new Error(`Não consegui baixar o áudio (${baixado.status}).`);
    const original = path.join(pasta, 'orig');
    await fs.writeFile(original, Buffer.from(await baixado.arrayBuffer()));
    // Sempre manda MP3 (as do Lyria podem estar em WAV)
    const mp3 = path.join(pasta, 'orig.mp3');
    await rodarFfmpeg(['-i', original, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
    const totalSeg = await duracaoDe(mp3);
    if (!totalSeg) throw new Error('Não consegui medir a duração do áudio.');
    if (totalSeg + extraSeg > 590) return res.status(400).json({ erro: 'A música ficaria com mais de 10 minutos, que é o limite.' });

    const up = await enviarParaElevenLabs(key, await fs.readFile(mp3), 'musica.mp3');
    const corpoUp = await up.text();
    if (!up.ok) throw new Error(erroAmigavel(up.status, corpoUp, 'envio do áudio'));
    let enviado = {};
    try { enviado = JSON.parse(corpoUp); } catch { /* resposta inesperada */ }
    if (!enviado.song_id) throw new Error('A ElevenLabs recebeu o áudio mas não devolveu o identificador da música.');

    const trechos = trechosDoPlano(enviado.composition_plan);
    const somaMs = trechos.length ? trechos[trechos.length - 1].fim : 0;
    // Se o plano extraído não bate com a duração real, usa só a duração (corte simples no final)
    const planoConfiavel = somaMs && Math.abs(somaMs - totalSeg * 1000) < 4000;
    const { plano, novoTotalMs, letraExtra } = montarPlano({
      songId: enviado.song_id,
      totalMs: Math.round(totalSeg * 1000),
      trechos: planoConfiavel ? trechos : [],
      letra: m.letra,
      estilo: m.estilo,
      instrumental: !!m.instrumental,
      extraSeg,
    });

    const r = await compor(key, plano);
    if (!r.ok) throw new Error(erroAmigavel(r.status, await r.text(), 'geração do trecho novo'));
    const buffer = Buffer.from(await r.arrayBuffer());

    const blob = await put(`estudio-musica/${Date.now()}-elevenlabs-maior.mp3`, buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });

    const { stems, ...resto } = m; // a separação voz/instrumental era do áudio antigo
    const musica = {
      ...resto,
      letra: letraExtra && m.letra ? `${m.letra.trim()}\n\n${letraExtra}`.slice(0, 6000) : (m.letra || ''),
      duracaoSeg: Math.round(novoTotalMs / 1000),
      audioUrl: blob.url,
      favorito: false,
      versao: (parseInt(m.versao, 10) || 1) + 1,
      grupoId: m.grupoId || String(id),
      aumentadaDe: String(id),
      aumentoSeg: extraSeg,
      criadoEm: new Date().toISOString(),
    };
    const ref = await db.collection(COL).add(musica);
    return res.status(200).json({ musica: { id: ref.id, ...musica } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
