// Estúdio de Música — gera UMA música com o motor escolhido e salva na biblioteca.
// A tela chama esta rota 2x em paralelo para ter 2 versões (igual Suno/Nuivi).
//
// POST {
//   motor: 'elevenlabs' | 'lyria',
//   modo: 'simples' | 'personalizado',
//   descricao,            // modo simples: "uma música gospel sobre esperança..."
//   titulo, letra,        // modo personalizado
//   estilo,               // texto de estilo (ex: "Brazilian gospel worship, piano")
//   voz,                  // chave de VOZES abaixo (ex.: 'masculina', 'masc-potente', 'dupla') | ''
//   instrumental,         // true = sem voz
//   duracaoSeg,           // 30..300
//   grupoId, versao       // para juntar as versões da mesma criação
// }
// -> { musica }

import { put } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '1mb' } } };

const VOZES = {
  masculina: 'male lead vocal',
  'masc-potente': 'male lead vocal, clean and clear tone, no rasp, powerful emotional belting with strong high notes in the chorus, warm mid-range in the verses',
  'masc-suave': 'male lead vocal, soft, warm and intimate tone, gentle delivery, smooth and calm',
  'masc-rouca': 'male lead vocal, raspy and gritty tone, emotional and heartfelt delivery',
  feminina: 'female lead vocal',
  'fem-potente': 'female lead vocal, clean and powerful, strong belting with high notes in the chorus, emotional delivery',
  'fem-suave': 'female lead vocal, soft, sweet and intimate tone, gentle and airy delivery',
  dupla: 'two male lead vocalists singing in close harmony, Brazilian sertanejo duo style (dupla sertaneja)',
  dueto: 'male and female duet vocals',
  coral: 'lead vocal with gospel choir backing',
};

// Cada estilo tem o SEU tipo de cantor. Sem isso a IA canta tudo em português com a mesma voz
// (que puxa para o sertanejo). A voz escolhida na tela define homem/mulher e o timbre;
// aqui entra o jeito de cantar do gênero.
const CANTORES = [
  { id: 'forro', teste: /forr[oó]|piseiro|xote|bai[aã]o|zabumba/i, cantor: 'Northeastern Brazilian forró / piseiro singer with a nordestino accent, bright and slightly nasal tone, rhythmic syncopated phrasing typical of forró and piseiro, festive and danceable delivery' },
  { id: 'reggae', teste: /reggae|ska\b|dub\b/i, cantor: 'Brazilian reggae singer, relaxed warm and smooth tone, laid-back sunny phrasing on the offbeat, positive vibe' },
  { id: 'metal', teste: /heavy metal|\bmetal\b|thrash|power metal/i, cantor: 'heavy metal singer, powerful high operatic tenor, soaring sustained notes and wails, dramatic and epic delivery' },
  { id: 'rock', teste: /\brock\b|metal|grunge|punk|hard rock/i, cantor: 'rock band frontman, gritty powerful rock vocals with raspy belting and attitude, sustained high notes and energy in the chorus, sung like Brazilian rock (rock nacional), not pop, not sertanejo' },
  { id: 'rnb', teste: /r&b|\brnb\b/i, cantor: 'contemporary R&B singer, silky smooth tone, melismatic runs and soft falsetto, intimate and sensual delivery' },
  { id: 'soul', teste: /\bsoul\b|motown/i, cantor: 'soul singer, warm rich and powerful voice, gospel-influenced runs and ad-libs, deeply emotional delivery' },
  { id: 'jazz', teste: /\bjazz\b/i, cantor: 'jazz vocalist, smooth relaxed and sophisticated phrasing, behind-the-beat swing, intimate tone' },
  { id: 'blues', teste: /blues|soul/i, cantor: 'soulful blues singer, gritty warm tone, bluesy bends and runs, expressive and emotional phrasing' },
  { id: 'trap', teste: /\btrap\b/i, cantor: 'Brazilian trap artist, melodic half-sung rap with autotune, laid-back confident flow, ad-libs' },
  { id: 'rap', teste: /\brap\b|hip.?hop|boom bap/i, cantor: 'Brazilian rapper, rhythmic confident flow with clear diction in the verses, sung melodic hook in the chorus' },
  { id: 'eletronica', teste: /\bedm\b|electronic dance|house beat|house music|eletr[oô]nica/i, cantor: 'dance-pop vocalist, bright clean and catchy topline, processed airy vocals, energetic hook' },
  { id: 'axe', teste: /\bax[eé](?![a-zà-ú])/i, cantor: 'Bahian axé singer, bright energetic festive voice, call-and-response with the crowd, carnival energy' },
  { id: 'funk', teste: /\bfunk\b|baile/i, cantor: 'Brazilian funk MC, rhythmic half-spoken half-sung delivery, confident street style, catchy chant-like hook' },
  { id: 'pagode', teste: /pagode|samba|cavaquinho/i, cantor: 'Brazilian pagode / samba singer, smooth swinging carioca phrasing, relaxed and romantic, group backing vocals answering in the chorus' },
  { id: 'gaucha', teste: /ga[uú]ch|nativis|milonga|chamam[eé]|vanera/i, cantor: 'Southern Brazilian gaucho nativist singer, deep warm baritone, proud storytelling delivery, milonga phrasing' },
  { id: 'country', teste: /american country|\bcountry music\b/i, cantor: 'country singer, warm storytelling voice with a gentle twang, heartfelt delivery' },
  { id: 'sertanejo', teste: /sertanej|viola caipira|country/i, cantor: 'Brazilian sertanejo singer, typical sertanejo vocal style with emotional twang' },
  { id: 'bossa', teste: /^(?![\s\S]*\bmpb\b)[\s\S]*bossa nova/i, cantor: 'bossa nova singer, very soft, almost whispered, intimate and relaxed phrasing, close to the microphone' },
  { id: 'mpb', teste: /\bmpb\b|bossa/i, cantor: 'Brazilian MPB singer, intimate and natural, soft bossa nova phrasing, close to the microphone' },
  { id: 'lofi', teste: /lo-?fi|chill/i, cantor: 'soft breathy laid-back vocals, relaxed and intimate' },
  { id: 'infantil', teste: /children|infantil|kids/i, cantor: 'cheerful friendly singer for a children\'s song, very clear, simple and playful' },
  { id: 'gospel-animado', teste: /upbeat.*gospel|gospel.*(festive|danceable|upbeat)/i, cantor: 'energetic Brazilian gospel singer, joyful celebratory vocals, call-and-response with backing singers' },
  { id: 'gospel', teste: /gospel|worship|louvor/i, cantor: 'Brazilian contemporary worship (louvor) singer, heartfelt clean tone, soaring gospel runs in the chorus' },
  { id: 'balada', teste: /romantic ballad|\bballad\b|balada/i, cantor: 'romantic ballad singer, expressive and emotional, gentle verses building to a powerful sustained chorus' },
  { id: 'pop', teste: /\bpop\b/i, cantor: 'modern pop singer, polished catchy delivery, breathy verses and bright chorus' },
];

// Estilos que o motor da ElevenLabs recebe como lista (o "plano da música"): o que QUER e o que NÃO QUER.
// É bem mais forte que só escrever no texto — é aqui que o rock deixa de sair com cara de sertanejo.
const SEM_SERTANEJO = ['sertanejo', 'sertanejo universitario', 'brazilian country', 'country', 'twangy vocals', 'viola caipira', 'arrocha', 'modao'];
const GENEROS = {
  reggae: { pos: ['reggae', 'brazilian reggae', 'offbeat skank guitar', 'deep groovy bass', 'one drop drums', 'laid-back groove', 'relaxed warm vocals'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars', 'accordion'] },
  metal: { pos: ['heavy metal', 'galloping bass and guitars', 'twin harmonized lead guitars', 'fast double kick drums', 'high operatic metal vocals', 'epic'], neg: [...SEM_SERTANEJO, 'pop', 'acoustic ballad', 'accordion', 'pagode', 'soft vocals'] },
  rock: { pos: ['rock', 'brazilian rock', 'hard rock', 'distorted electric guitars', 'heavy guitar riffs', 'powerful live rock drums', 'electric bass', 'raspy powerful rock vocals', 'rock band energy'], neg: [...SEM_SERTANEJO, 'acoustic ballad', 'pop ballad', 'accordion', 'pagode', 'soft vocals', 'romantic ballad'] },
  forro: { pos: ['forro', 'piseiro', 'northeastern brazilian music', 'accordion lead', 'zabumba', 'triangle', 'danceable', 'nordestino vocals'], neg: [...SEM_SERTANEJO, 'rock', 'electric guitar solo'] },
  pagode: { pos: ['pagode', 'samba', 'cavaquinho', 'pandeiro', 'tantan', 'swing', 'group backing vocals'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars'] },
  funk: { pos: ['brazilian funk', 'funk carioca', 'tamborzao beat', 'heavy 808', 'mc vocals'], neg: [...SEM_SERTANEJO, 'acoustic guitar', 'rock'] },
  soul: { pos: ['soul', 'classic soul', 'electric piano', 'horn section', 'groovy bass', 'warm soulful vocals', 'gospel-tinged backing vocals'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars', 'accordion'] },
  rnb: { pos: ['r&b', 'contemporary r&b', 'smooth groove', '808 bass', 'lush chords', 'silky smooth vocals', 'vocal runs'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars', 'accordion'] },
  jazz: { pos: ['jazz', 'smooth jazz', 'upright bass', 'brushed drums', 'jazz piano', 'saxophone', 'smooth jazz vocals'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars', 'accordion'] },
  trap: { pos: ['trap', 'brazilian trap', '808 bass', 'fast hi-hats', 'dark synths', 'melodic autotune vocals'], neg: [...SEM_SERTANEJO, 'acoustic guitar', 'rock', 'accordion'] },
  rap: { pos: ['hip hop', 'brazilian rap', 'boom bap drums', 'deep bass', 'rap verses', 'sung hook'], neg: [...SEM_SERTANEJO, 'rock', 'accordion'] },
  eletronica: { pos: ['electronic dance music', 'house', 'four-on-the-floor kick', 'synth leads', 'build-up and drop', 'processed pop vocals'], neg: [...SEM_SERTANEJO, 'acoustic guitar', 'accordion', 'rock'] },
  axe: { pos: ['axe music', 'bahia carnival', 'timbau and surdo percussion', 'brass section', 'festive', 'energetic call-and-response vocals'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars'] },
  country: { pos: ['country', 'american country', 'steel guitar', 'fiddle', 'acoustic guitar', 'warm country vocals'], neg: ['sertanejo', 'arrocha', 'accordion', 'pagode'] },
  bossa: { pos: ['bossa nova', 'nylon guitar', 'soft syncopated rhythm', 'light percussion', 'soft intimate vocals'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars'] },
  balada: { pos: ['romantic ballad', 'piano', 'strings', 'slow tempo', 'emotional vocals', 'big chorus'], neg: [...SEM_SERTANEJO, 'rock', 'distorted guitars'] },
  blues: { pos: ['blues', 'soul', 'hammond organ', 'bluesy electric guitar', 'soulful gritty vocals'], neg: [...SEM_SERTANEJO] },
  gospel: { pos: ['gospel', 'contemporary worship', 'louvor', 'piano', 'atmospheric pads', 'soaring worship vocals'], neg: [...SEM_SERTANEJO] },
  'gospel-animado': { pos: ['upbeat gospel', 'praise', 'celebratory', 'live band', 'gospel choir responses'], neg: [...SEM_SERTANEJO] },
  mpb: { pos: ['mpb', 'bossa nova', 'nylon guitar', 'intimate vocals'], neg: [...SEM_SERTANEJO, 'rock'] },
  pop: { pos: ['pop', 'modern pop production', 'catchy hook', 'polished pop vocals'], neg: [...SEM_SERTANEJO] },
  lofi: { pos: ['lo-fi', 'chill', 'soft breathy vocals'], neg: [...SEM_SERTANEJO] },
  infantil: { pos: ["children's music", 'playful', 'cheerful clear vocals'], neg: [...SEM_SERTANEJO, 'rock'] },
  gaucha: { pos: ['gaucho music', 'milonga', 'nativist', 'nylon guitar', 'accordion', 'deep baritone vocals'], neg: ['rock', 'pop'] },
  sertanejo: { pos: ['sertanejo'], neg: [] },
};

function cantorDoEstilo(estilo) {
  return CANTORES.find((c) => c.teste.test(estilo || '')) || null;
}

function montarPrompt({ modo, descricao, letra, estilo, voz, instrumental, duracaoSeg }) {
  const partes = [];
  const genero = cantorDoEstilo(`${estilo} ${modo === 'simples' ? descricao : ''}`);
  if (estilo) partes.push(`Style: ${estilo}.`);
  if (modo === 'simples' && descricao) partes.push(`Song idea: ${descricao}.`);
  if (instrumental) {
    partes.push('Instrumental only, no vocals.');
  } else {
    // "Dupla sertaneja" só faz sentido no sertanejo; nos outros estilos vira dupla de vozes do próprio estilo
    let v = VOZES[voz] || 'lead vocal';
    if (voz === 'dupla' && genero && !['sertanejo', 'gaucha'].includes(genero.id)) v = 'two male lead vocalists singing in harmony';
    partes.push(`Vocals: ${v}.`);
    if (genero) partes.push(`Singer: ${genero.cantor}.`);
    partes.push('Sung in Brazilian Portuguese, clear pronunciation.');
    if (genero && !['sertanejo', 'gaucha', 'country'].includes(genero.id)) {
      partes.push('The singing style must match the genre: do NOT sing like sertanejo, no country twang.');
    }
  }
  // Reforço no texto (o Google Lyria só entende o texto): gênero no começo e o que evitar
  const g = genero && GENEROS[genero.id];
  if (g && g.pos.length > 1) {
    partes.unshift(`Genre: ${g.pos.slice(0, 6).join(', ')}.`);
    if (g.neg.length) partes.push(`Avoid: ${g.neg.join(', ')}.`);
  }
  if (duracaoSeg) partes.push(`Length about ${Math.round(duracaoSeg)} seconds.`);
  if (!instrumental && modo === 'personalizado' && letra) {
    partes.push(`Use exactly these lyrics, in this order:\n${letra.trim()}`);
  }
  return partes.join('\n');
}

// Pede à ElevenLabs o plano da música (não gasta crédito) e reforça o gênero:
// junta os estilos do gênero e proíbe o sertanejo em todas as partes.
async function planoComGenero(key, modelo, prompt, duracaoMs, genero) {
  const g = genero && GENEROS[genero.id];
  if (!g) return null;
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/music/plan', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.slice(0, 4100), music_length_ms: duracaoMs, model_id: modelo }),
    });
    if (!r.ok) return null;
    const plano = await r.json();
    if (!Array.isArray(plano?.sections) || !plano.sections.length) return null;
    const proibidos = g.neg.map((x) => x.toLowerCase());
    const limpa = (lista) => (Array.isArray(lista) ? lista : []).filter((x) => !proibidos.some((p) => String(x).toLowerCase().includes(p)));
    const uniq = (lista) => [...new Map(lista.map((x) => [String(x).toLowerCase(), x])).values()];
    return {
      ...plano,
      positive_global_styles: uniq([...g.pos, ...limpa(plano.positive_global_styles)]).slice(0, 20),
      negative_global_styles: uniq([...(plano.negative_global_styles || []), ...g.neg]).slice(0, 20),
      sections: plano.sections.map((sec) => ({
        ...sec,
        positive_local_styles: limpa(sec.positive_local_styles),
        negative_local_styles: uniq([...(sec.negative_local_styles || []), ...g.neg.slice(0, 5)]),
      })),
    };
  } catch {
    return null;
  }
}

async function gerarElevenLabs(prompt, { instrumental, duracaoSeg, genero }) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY não está configurada na Vercel.');
  const modelo = process.env.ELEVENLABS_MUSIC_MODEL || 'music_v2_5';
  const duracaoMs = Math.max(10, Math.min(300, duracaoSeg || 150)) * 1000;
  let plano = instrumental ? null : await planoComGenero(key, modelo, prompt, duracaoMs, genero);
  // Limite do plano (2 pedidos ao mesmo tempo na ElevenLabs, contando a voz da fábrica):
  // espera a vez e tenta de novo, em vez de dar erro
  const compor = async (corpo) => {
    for (let vez = 0; ; vez++) {
      const resp = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (resp.status !== 429 || vez >= 8) return resp;
      const txt = await resp.clone().text();
      if (!/concurrent|too many|rate/i.test(txt)) return resp;
      await new Promise((ok) => setTimeout(ok, 12000 + Math.random() * 6000));
    }
  };
  const porTexto = { prompt: prompt.slice(0, 4100), music_length_ms: duracaoMs, model_id: modelo, force_instrumental: !!instrumental };
  let r = await compor(plano ? { composition_plan: plano, model_id: modelo } : porTexto);
  if (!r.ok && plano && r.status !== 401 && r.status !== 402) {
    plano = null; // o plano foi recusado: gera do jeito antigo (só pelo texto)
    r = await compor(porTexto);
  }
  if (!r.ok) {
    const txt = await r.text();
    let msg = txt;
    try {
      const j = JSON.parse(txt);
      msg = j.detail?.message || j.detail?.status || (typeof j.detail === 'string' ? j.detail : '') || txt;
    } catch { /* texto puro */ }
    if (/music_generation/i.test(msg)) {
      throw new Error('ElevenLabs: sua chave de API não tem a permissão "Music Generation". No site da ElevenLabs vá em Developers → API Keys, edite a chave e ative Music Generation.');
    }
    throw new Error(`ElevenLabs: ${String(msg).slice(0, 300)}`);
  }
  const buffer = Buffer.from(await r.arrayBuffer());
  return { buffer, modelo, mime: 'audio/mpeg', letraGerada: '', plano };
}

async function gerarLyria(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não está configurada na Vercel (crie em aistudio.google.com).');
  const modelo = process.env.LYRIA_MODEL || 'lyria-3.5';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = d?.error?.message || String(r.status);
    if (/free_tier|limit: 0/i.test(msg)) {
      throw new Error('Google Lyria: o plano gratuito não inclui geração de música. Ative o faturamento (billing) no Google AI Studio para o projeto dessa chave.');
    }
    throw new Error(`Google Lyria: ${msg.slice(0, 300)}`);
  }

  const parts = d?.candidates?.[0]?.content?.parts || [];
  let audio = null;
  let texto = '';
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data && !audio) audio = inline;
    else if (p.text) texto += p.text;
  }
  if (!audio) {
    const motivo = d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || 'sem áudio na resposta';
    throw new Error(`Google Lyria não devolveu áudio (${motivo}).`);
  }
  const mime = audio.mimeType || audio.mime_type || 'audio/mpeg';
  return { buffer: Buffer.from(audio.data, 'base64'), modelo, mime, letraGerada: texto.trim() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const b = req.body || {};
  const motor = b.motor === 'lyria' ? 'lyria' : 'elevenlabs';
  const modo = b.modo === 'personalizado' ? 'personalizado' : 'simples';
  const instrumental = !!b.instrumental;
  const duracaoSeg = Math.max(30, Math.min(300, parseInt(b.duracaoSeg, 10) || 150));

  if (modo === 'simples' && !String(b.descricao || '').trim()) {
    return res.status(400).json({ erro: 'Descreva a música que você quer.' });
  }
  if (modo === 'personalizado' && !instrumental && !String(b.letra || '').trim()) {
    return res.status(400).json({ erro: 'Escreva (ou gere) a letra, ou marque Instrumental.' });
  }

  const dados = {
    modo,
    descricao: String(b.descricao || '').slice(0, 1000),
    letra: String(b.letra || '').slice(0, 3500),
    estilo: String(b.estilo || '').slice(0, 900),
    voz: String(b.voz || ''),
    instrumental,
    duracaoSeg,
  };
  const prompt = montarPrompt(dados);

  try {
    const genero = cantorDoEstilo(`${dados.estilo} ${modo === 'simples' ? dados.descricao : ''}`);
    const r = motor === 'lyria' ? await gerarLyria(prompt) : await gerarElevenLabs(prompt, { ...dados, genero });

    const ext = r.mime.includes('wav') ? 'wav' : 'mp3';
    const blob = await put(`estudio-musica/${Date.now()}-${motor}.${ext}`, r.buffer, {
      access: 'public',
      contentType: r.mime,
      token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });

    const titulo = String(b.titulo || '').trim()
      || (dados.descricao ? dados.descricao.split(/[.,\n]/)[0].slice(0, 60) : 'Nova música');

    const musica = {
      titulo,
      motor,
      modelo: r.modelo,
      modo,
      descricao: dados.descricao,
      letra: dados.letra || r.letraGerada || '',
      estilo: dados.estilo,
      voz: dados.voz,
      instrumental,
      duracaoSeg,
      prompt,
      genero: genero?.id || '',
      plano: r.plano ? JSON.stringify({ pos: r.plano.positive_global_styles, neg: r.plano.negative_global_styles, partes: r.plano.sections.map((x) => x.section_name) }).slice(0, 3000) : '',
      audioUrl: blob.url,
      capaUrl: '',
      favorito: false,
      grupoId: String(b.grupoId || ''),
      versao: parseInt(b.versao, 10) || 1,
      criadoEm: new Date().toISOString(),
    };

    const ref = await getDb().collection('youvideo_estudio_musicas').add(musica);
    return res.status(200).json({ musica: { id: ref.id, ...musica } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
