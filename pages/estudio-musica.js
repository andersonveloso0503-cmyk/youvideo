import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { avaliarStreaming, escolhidas, letraLimpa, paraWav, capaQuadrada, ficha } from '../lib/streaming';
import { capaComTitulo } from '../lib/capaTitulo';

// Nome do gênero como aparece na lista das distribuidoras
const GENERO_STREAMING = [
  [/reggae/i, 'Reggae'], [/heavy metal|\bmetal\b/i, 'Metal'], [/\brock\b/i, 'Rock'], [/forr[oó]|piseiro|xote|bai[aã]o/i, 'Forró (Brazilian)'],
  [/sertanej/i, 'Sertanejo (Brazilian)'], [/ga[uú]ch|milonga|nativis/i, 'Brazilian / Regional'], [/pagode|samba/i, 'Samba / Pagode (Brazilian)'],
  [/\bfunk\b/i, 'Funk Carioca (Brazilian)'], [/\bmpb\b|bossa/i, 'MPB (Brazilian)'],
  [/r&b|\brnb\b|\bsoul\b/i, 'R&B / Soul'], [/\bjazz\b/i, 'Jazz'], [/\btrap\b|\brap\b|hip.?hop/i, 'Hip Hop / Rap'],
  [/electronic dance|\bedm\b|eletronica/i, 'Electronic / Dance'], [/\bax[eé](?![a-zà-ú])/i, 'Axé (Brazilian)'], [/\bcountry\b/i, 'Country'],
  [/blues|soul/i, 'Blues'], [/gospel|worship|louvor/i, 'Christian & Gospel'],
  [/lo-?fi|chill/i, 'Electronic / Lo-fi'], [/children|infantil/i, "Children's Music"], [/ballad|balada/i, 'Pop'], [/\bpop\b/i, 'Pop'],
];
const generoStreaming = (m) => (GENERO_STREAMING.find(([re]) => re.test(`${m.genero || ''} ${m.estilo || ''}`)) || [, ''])[1];

// ───────────────────────── Estilos prontos (chips) ─────────────────────────

const ESTILOS = [
  { id: 'gospel', nome: 'Gospel / Louvor', base: 'Brazilian gospel worship, modern, emotional, piano and pads, uplifting build' },
  { id: 'gospel-animado', nome: 'Gospel Animado', base: 'upbeat Brazilian gospel, festive, drums, bass, joyful, danceable' },
  { id: 'sertanejo', nome: 'Sertanejo', base: 'Brazilian sertanejo, romantic, acoustic guitar, accordion touch' },
  { id: 'sertanejo-potente', nome: 'Sertanejo Arena', base: 'Brazilian sertanejo, modern arena sertanejo production, acoustic guitar and viola caipira, full band, big anthemic chorus' },
  { id: 'gaucha', nome: 'Gaúcha / Nativista', base: 'Southern Brazilian gaucho music, milonga, nylon guitar, accordion' },
  { id: 'pagode', nome: 'Pagode / Samba', base: 'Brazilian pagode, samba, cavaquinho, pandeiro, swing' },
  { id: 'forro', nome: 'Forró / Piseiro', base: 'Brazilian forro piseiro, accordion, zabumba, danceable' },
  { id: 'mpb', nome: 'MPB / Acústico', base: 'Brazilian MPB, acoustic, bossa nova touch, intimate' },
  { id: 'pop', nome: 'Pop', base: 'modern pop, catchy hook, clean production' },
  { id: 'rock', nome: 'Rock', base: 'rock, electric guitars, powerful drums, energetic' },
  { id: 'metal', nome: 'Heavy Metal', base: 'heavy metal, distorted guitars, galloping rhythm, twin lead guitars, powerful drums, epic' },
  { id: 'reggae', nome: 'Reggae', base: 'reggae, offbeat skank guitar, groovy bass, one drop drums, laid-back sunny vibe' },
  { id: 'funk', nome: 'Funk BR', base: 'Brazilian funk, heavy beat, catchy' },
  { id: 'blues', nome: 'Blues Gospel', base: 'soulful blues gospel, organ, electric guitar, emotional' },
  { id: 'blues-raiz', nome: 'Blues', base: 'classic blues, 12-bar shuffle, electric guitar licks, harmonica, walking bass, raw and soulful' },
  { id: 'soul', nome: 'Soul', base: 'soul music, warm vintage groove, electric piano, horn section, tight rhythm section, heartfelt and emotional' },
  { id: 'rnb', nome: 'R&B', base: 'contemporary R&B, smooth groove, lush chords, 808 bass, silky vocals, sensual and modern' },
  { id: 'jazz', nome: 'Jazz', base: 'smooth jazz, upright bass, brushed drums, piano, saxophone, sophisticated and swinging' },
  { id: 'bossa', nome: 'Bossa Nova', base: 'bossa nova, soft nylon guitar, gentle syncopated rhythm, light percussion, intimate and elegant' },
  { id: 'balada', nome: 'Balada Romântica', base: 'romantic ballad, piano and strings, slow tempo, emotional, big chorus' },
  { id: 'rap', nome: 'Rap / Hip Hop', base: 'Brazilian hip hop, boom bap beat, deep bass, rhythmic rap verses, sung hook' },
  { id: 'trap', nome: 'Trap', base: 'Brazilian trap, hard 808 bass, fast hi-hats, dark atmospheric synths, melodic autotune vocals' },
  { id: 'eletronica', nome: 'Eletrônica / Dance', base: 'electronic dance music, four-on-the-floor house beat, synth leads, build-ups and drops, energetic' },
  { id: 'axe', nome: 'Axé', base: 'Brazilian axe music from Bahia, carnival percussion, timbau and surdo, brass stabs, festive and danceable' },
  { id: 'country', nome: 'Country', base: 'American country music, steel guitar, fiddle, acoustic guitar, storytelling, warm and heartfelt' },
  { id: 'lofi', nome: 'Lo-fi / Relax', base: 'lo-fi chill, soft beats, calm, relaxing' },
  { id: 'infantil', nome: 'Infantil', base: "children's song, playful, cheerful, simple melody" },
];

// ───────────────────────── Ideias de instrumentos, solos e arranjo ─────────────────────────
// nome = o que aparece na tela; en = o que vai pro motor de IA (entende melhor em inglês)

const IDEIAS = [
  {
    cat: 'Guitarra', emoji: '🎸',
    itens: [
      { id: 'solo-pent', nome: 'Solo na pentatônica', en: 'melodic electric guitar solo using the pentatonic scale' },
      { id: 'solo-blues', nome: 'Solo blues com bends', en: 'expressive blues guitar solo with string bends and vibrato' },
      { id: 'solo-rock', nome: 'Solo de rock rápido', en: 'fast shredding rock guitar solo' },
      { id: 'solo-melod', nome: 'Solo melódico worship', en: 'soaring melodic worship guitar solo with delay and reverb' },
      { id: 'slide', nome: 'Slide guitar', en: 'slide guitar licks' },
      { id: 'wah', nome: 'Wah-wah', en: 'wah-wah guitar' },
      { id: 'riff', nome: 'Riff marcante', en: 'catchy distorted guitar riff' },
      { id: 'dedilhado', nome: 'Violão dedilhado', en: 'fingerpicked acoustic guitar' },
      { id: 'violao-nylon', nome: 'Violão de nylon', en: 'nylon string guitar' },
      { id: 'viola', nome: 'Viola caipira', en: 'Brazilian viola caipira' },
      { id: 'cavaco', nome: 'Cavaquinho', en: 'cavaquinho' },
      { id: 'guit-limpa', nome: 'Guitarra limpa (clean)', en: 'clean electric guitar arpeggios' },
    ],
  },
  {
    cat: 'Metais e sopros', emoji: '🎺',
    itens: [
      { id: 'trompete', nome: 'Trompetes', en: 'bright trumpets' },
      { id: 'solo-trompete', nome: 'Solo de trompete', en: 'trumpet solo' },
      { id: 'naipe', nome: 'Naipe de metais', en: 'punchy brass section (trumpet, trombone, sax)' },
      { id: 'sax', nome: 'Saxofone', en: 'smooth saxophone' },
      { id: 'solo-sax', nome: 'Solo de sax', en: 'soulful saxophone solo' },
      { id: 'trombone', nome: 'Trombone', en: 'trombone' },
      { id: 'flauta', nome: 'Flauta', en: 'flute melody' },
      { id: 'gaita', nome: 'Gaita (harmônica)', en: 'harmonica' },
      { id: 'acordeon', nome: 'Acordeon / Sanfona', en: 'accordion' },
    ],
  },
  {
    cat: 'Teclados', emoji: '🎹',
    itens: [
      { id: 'piano', nome: 'Piano', en: 'expressive grand piano' },
      { id: 'solo-piano', nome: 'Solo de piano', en: 'piano solo' },
      { id: 'hammond', nome: 'Órgão Hammond', en: 'Hammond organ' },
      { id: 'rhodes', nome: 'Rhodes / piano elétrico', en: 'Rhodes electric piano' },
      { id: 'pads', nome: 'Pads atmosféricos', en: 'lush atmospheric synth pads' },
      { id: 'synth80', nome: 'Sintetizador anos 80', en: '80s analog synthesizers' },
    ],
  },
  {
    cat: 'Cordas e orquestra', emoji: '🎻',
    itens: [
      { id: 'violino', nome: 'Violino', en: 'violin' },
      { id: 'solo-violino', nome: 'Solo de violino', en: 'emotional violin solo' },
      { id: 'cello', nome: 'Violoncelo', en: 'cello' },
      { id: 'orquestra', nome: 'Orquestra épica', en: 'epic cinematic orchestra' },
      { id: 'harpa', nome: 'Harpa', en: 'harp' },
    ],
  },
  {
    cat: 'Ritmo e percussão', emoji: '🥁',
    itens: [
      { id: 'bat-forte', nome: 'Bateria forte', en: 'powerful live drums' },
      { id: 'bat-suave', nome: 'Bateria suave (vassourinha)', en: 'soft brushed drums' },
      { id: 'baixo-groove', nome: 'Baixo com groove', en: 'groovy bass line' },
      { id: 'slap', nome: 'Baixo slap', en: 'slap bass' },
      { id: 'palmas', nome: 'Palmas', en: 'hand claps' },
      { id: 'percussao', nome: 'Percussão brasileira', en: 'Brazilian percussion (pandeiro, surdo, tamborim)' },
      { id: 'zabumba', nome: 'Zabumba e triângulo', en: 'zabumba and triangle' },
      { id: 'beat', nome: 'Beat eletrônico', en: 'electronic beat' },
    ],
  },
  {
    cat: 'Reggae e ska', emoji: '🌴',
    itens: [
      { id: 'skank', nome: 'Guitarra skank (contratempo)', en: 'offbeat reggae skank guitar chops' },
      { id: 'baixo-reggae', nome: 'Baixo reggae grave', en: 'deep round reggae bass lines' },
      { id: 'one-drop', nome: 'Bateria one drop', en: 'one drop reggae drum groove with rimshots' },
      { id: 'steppers', nome: 'Bateria steppers', en: 'steppers reggae drum beat with four on the floor kick' },
      { id: 'orgao-bubble', nome: 'Órgão bubble', en: 'reggae organ bubble rhythm' },
      { id: 'melodica', nome: 'Melódica', en: 'melodica melody' },
      { id: 'metais-reggae', nome: 'Metais de reggae', en: 'reggae horn section with trumpet and trombone' },
      { id: 'dub', nome: 'Efeitos dub (eco e delay)', en: 'dub effects with heavy echo and delay throws' },
      { id: 'ska', nome: 'Ritmo ska acelerado', en: 'upbeat ska rhythm with fast offbeat guitar' },
      { id: 'praia', nome: 'Clima de praia / violão reggae', en: 'acoustic beach reggae vibe with acoustic guitar' },
    ],
  },
  {
    cat: 'Gaúcho e nativista', emoji: '🧉',
    itens: [
      { id: 'gaita-gaucha', nome: 'Gaita gaúcha (acordeon)', en: 'southern Brazilian gaucho accordion (gaita) lead' },
      { id: 'gaita-ponto', nome: 'Gaita ponto (botoneira)', en: 'diatonic button accordion (gaita ponto) melodies' },
      { id: 'violao-milonga', nome: 'Violão de milonga', en: 'nylon guitar milonga fingerpicking' },
      { id: 'bombo', nome: 'Bombo leguero', en: 'bombo leguero drum' },
      { id: 'vanera', nome: 'Ritmo de vanera / vaneirão', en: 'fast vanera gaucho dance rhythm' },
      { id: 'chamame', nome: 'Ritmo de chamamé', en: 'chamame rhythm in 6/8' },
      { id: 'milonga-lenta', nome: 'Milonga lenta', en: 'slow melancholic milonga rhythm' },
      { id: 'contrabaixo-acust', nome: 'Contrabaixo acústico', en: 'acoustic upright bass' },
      { id: 'declamado', nome: 'Trecho declamado', en: 'short spoken poetic recitation section' },
    ],
  },
  {
    cat: 'Nordeste', emoji: '🌵',
    itens: [
      { id: 'sanfona-forro', nome: 'Sanfona de forró', en: 'forro accordion (sanfona) lead' },
      { id: 'triangulo', nome: 'Triângulo', en: 'forro triangle' },
      { id: 'zabumba2', nome: 'Zabumba', en: 'zabumba drum' },
      { id: 'pifano', nome: 'Pífano', en: 'pifano fife melody' },
      { id: 'rabeca', nome: 'Rabeca', en: 'rabeca fiddle' },
      { id: 'xote', nome: 'Ritmo de xote', en: 'xote rhythm' },
      { id: 'baiao', nome: 'Ritmo de baião', en: 'baiao rhythm' },
      { id: 'piseiro-teclado', nome: 'Teclado de piseiro', en: 'piseiro keyboard synth lead' },
    ],
  },
  {
    cat: 'Rock e metal', emoji: '🤘',
    itens: [
      { id: 'power-chords', nome: 'Power chords distorcidos', en: 'heavy distorted power chords' },
      { id: 'palm-mute', nome: 'Palm mute pesado', en: 'chugging palm muted guitar riffs' },
      { id: 'guitarras-gemeas', nome: 'Guitarras gêmeas (harmonia)', en: 'twin harmonized lead guitars' },
      { id: 'galope', nome: 'Ritmo galopante', en: 'galloping bass and guitar rhythm' },
      { id: 'bumbo-duplo', nome: 'Bumbo duplo', en: 'fast double kick drums' },
      { id: 'grito', nome: 'Grito agudo (metal)', en: 'high-pitched metal screams and wails' },
      { id: 'baixo-pesado', nome: 'Baixo distorcido', en: 'overdriven heavy bass' },
      { id: 'rock-anos80', nome: 'Rock anos 80', en: '80s hard rock production' },
      { id: 'rock-nacional', nome: 'Rock nacional anos 80/90', en: 'Brazilian rock from the 80s and 90s' },
      { id: 'grunge', nome: 'Grunge', en: 'grunge guitars and raw vocals' },
    ],
  },
  {
    cat: 'Samba e pagode', emoji: '🥁',
    itens: [
      { id: 'pandeiro', nome: 'Pandeiro', en: 'pandeiro' },
      { id: 'tantan', nome: 'Tantã e repique', en: 'tantan and repique de mao' },
      { id: 'surdo', nome: 'Surdo', en: 'surdo drum' },
      { id: 'cuica', nome: 'Cuíca', en: 'cuica' },
      { id: 'violao7', nome: 'Violão 7 cordas', en: 'seven string guitar bass runs' },
      { id: 'banjo', nome: 'Banjo de pagode', en: 'pagode banjo' },
      { id: 'roda', nome: 'Clima de roda de samba', en: 'live samba circle vibe with group vocals' },
    ],
  },
  {
    cat: 'Eletrônico', emoji: '🎧',
    itens: [
      { id: 'edm-drop', nome: 'Drop eletrônico', en: 'EDM build-up and drop' },
      { id: 'house', nome: 'Batida house', en: 'four on the floor house beat' },
      { id: 'trap', nome: 'Batida trap', en: 'trap beat with rolling hi-hats and 808' },
      { id: 'synth-lead', nome: 'Synth lead', en: 'bright synth lead' },
      { id: 'vocoder', nome: 'Voz com efeito (vocoder)', en: 'vocoder vocal effect' },
      { id: 'piano-house', nome: 'Piano house', en: 'piano house chords' },
    ],
  },
  {
    cat: 'Vozes e coro', emoji: '🎤',
    itens: [
      { id: 'coro', nome: 'Coral gospel', en: 'big gospel choir' },
      { id: 'backing', nome: 'Backing vocals', en: 'backing vocal harmonies' },
      { id: 'falsete', nome: 'Falsete', en: 'falsetto moments' },
      { id: 'adlibs', nome: 'Improvisos (ad-libs)', en: 'vocal ad-libs and runs' },
      { id: 'rouca', nome: 'Voz rouca / rasgada', en: 'raspy vocal' },
      { id: 'potente', nome: 'Voz potente', en: 'powerful belting vocal' },
      { id: 'intima', nome: 'Voz íntima e suave', en: 'soft intimate vocal' },
    ],
  },
  {
    cat: 'Arranjo e estrutura', emoji: '🧩',
    itens: [
      { id: 'intro-inst', nome: 'Intro instrumental', en: 'instrumental intro' },
      { id: 'build', nome: 'Crescendo até o refrão', en: 'gradual build-up into the chorus' },
      { id: 'modulacao', nome: 'Sobe o tom no último refrão', en: 'key change up for the final chorus' },
      { id: 'breakdown', nome: 'Parte só voz e piano', en: 'stripped-down breakdown with just voice and piano' },
      { id: 'drop', nome: 'Pausa e explosão (drop)', en: 'dramatic pause then full band drop' },
      { id: 'final-epico', nome: 'Final épico', en: 'big epic ending' },
      { id: 'fade', nome: 'Final em fade out', en: 'fade out ending' },
    ],
  },
  {
    cat: 'Clima e produção', emoji: '✨',
    itens: [
      { id: 'emocionante', nome: 'Emocionante', en: 'emotional and moving' },
      { id: 'alegre', nome: 'Alegre / festivo', en: 'joyful and festive' },
      { id: 'melancolico', nome: 'Melancólico', en: 'melancholic' },
      { id: 'epico', nome: 'Épico / cinematográfico', en: 'epic cinematic' },
      { id: 'aovivo', nome: 'Gravação ao vivo', en: 'live concert recording feel with crowd ambience' },
      { id: 'acustico', nome: 'Acústico / unplugged', en: 'acoustic unplugged' },
      { id: 'anos80', nome: 'Anos 80', en: '80s production' },
      { id: 'anos90', nome: 'Anos 90', en: '90s production' },
      { id: 'lofi', nome: 'Lo-fi', en: 'lo-fi warm tape texture' },
    ],
  },
];

const TODAS_IDEIAS = IDEIAS.flatMap((c) => c.itens);

// Combinações prontas (um clique marca várias ideias)
const RECEITAS = [
  { nome: '🔥 Louvor de arena', ids: ['intro-inst', 'build', 'solo-melod', 'coro', 'modulacao', 'final-epico', 'bat-forte'] },
  { nome: '🎷 Blues gospel', ids: ['solo-blues', 'hammond', 'backing', 'rouca'] },
  { nome: '🎺 Gospel com metais', ids: ['naipe', 'solo-trompete', 'palmas', 'coro', 'alegre'] },
  { nome: '🤘 Rock com solo', ids: ['riff', 'solo-rock', 'bat-forte', 'potente', 'final-epico'] },
  { nome: '🪗 Sertanejo raiz', ids: ['viola', 'acordeon', 'dedilhado', 'emocionante'] },
  { nome: '🌙 Balada ao piano', ids: ['piano', 'cello', 'intima', 'breakdown'] },
  { nome: '🎻 Épico orquestral', ids: ['orquestra', 'solo-violino', 'coro', 'epico', 'final-epico'] },
  { nome: '🕺 Anos 80', ids: ['synth80', 'slap', 'solo-sax', 'anos80'] },
  { nome: '🌴 Reggae de praia', ids: ['skank', 'baixo-reggae', 'one-drop', 'orgao-bubble', 'praia'] },
  { nome: '🌴 Reggae com metais', ids: ['skank', 'baixo-reggae', 'one-drop', 'metais-reggae', 'dub'] },
  { nome: '🧉 Vanera gaúcha', ids: ['gaita-gaucha', 'vanera', 'violao-milonga', 'alegre'] },
  { nome: '🧉 Milonga nativista', ids: ['violao-milonga', 'milonga-lenta', 'bombo', 'gaita-ponto', 'declamado'] },
  { nome: '🌵 Forró pé de serra', ids: ['sanfona-forro', 'zabumba2', 'triangulo', 'xote'] },
  { nome: '🤘 Heavy metal', ids: ['guitarras-gemeas', 'galope', 'bumbo-duplo', 'grito', 'final-epico'] },
  { nome: '🥁 Roda de samba', ids: ['pandeiro', 'tantan', 'cavaco', 'violao7', 'roda'] },
];

// Ritmo / energia da música
const RITMOS = [
  { id: '', nome: 'Automático', emoji: '🎲', en: '' },
  { id: 'lenta', nome: 'Lenta', emoji: '🐢', en: 'slow tempo around 70 bpm, calm and gentle', alt: ['slow tempo around 70 bpm'] },
  { id: 'media', nome: 'Média', emoji: '🚶', en: 'mid tempo around 95 bpm, steady groove', alt: ['mid tempo around 95 bpm'] },
  { id: 'animada', nome: 'Animada', emoji: '🏃', en: 'upbeat tempo around 120 bpm, energetic', alt: ['upbeat tempo around 125 bpm'] },
  { id: 'muito', nome: 'Muito animada', emoji: '🔥', en: 'very fast high-energy tempo around 140 bpm, danceable' },
];

function ritmoEn(id) {
  return RITMOS.find((r) => r.id === id)?.en || '';
}

function nomeRitmo(id) {
  const r = RITMOS.find((x) => x.id === id);
  return r && r.id ? `${r.emoji} ${r.nome}` : '';
}

function acharRitmo(texto) {
  for (const r of RITMOS) {
    if (!r.id) continue;
    for (const t of [r.en, ...(r.alt || [])]) {
      if (texto.includes(t)) return { id: r.id, texto: t };
    }
  }
  return null;
}

function EscolherRitmo({ valor, onChange, compacto }) {
  return (
    <div className={`rit ${compacto ? 'rit-c' : ''}`}>
      {RITMOS.map((r) => (
        <button key={r.id || 'auto'} type="button" className={valor === r.id ? 'on' : ''} onClick={() => onChange(r.id)} title={r.nome}>
          {r.emoji}{compacto ? '' : ` ${r.nome}`}
        </button>
      ))}
      <style jsx>{`
        .rit { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .rit button { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
        .rit button.on { border-color: var(--gold); background: var(--gold-soft); color: var(--gold); }
        .rit-c { gap: 4px; margin: 0; }
        .rit-c button { padding: 4px 9px; font-size: 15px; background: var(--bg-elevated); }
      `}</style>
    </div>
  );
}

// Descobre, a partir do texto de estilo salvo, qual estilo e quais ideias foram escolhidos
function descreverEstilo(texto) {
  let resto = texto || '';
  const est = ESTILOS.find((e) => resto.startsWith(e.base));
  if (est) resto = resto.slice(est.base.length);
  const rit = acharRitmo(resto);
  if (rit) resto = resto.replace(rit.texto, '');
  const ideias = TODAS_IDEIAS.filter((x) => resto.includes(x.en));
  ideias.forEach((x) => { resto = resto.replace(x.en, ''); });
  const extra = resto.split(',').map((t) => t.trim()).filter(Boolean).join(', ');
  return { estilo: est ? est.nome : '', ritmo: rit ? nomeRitmo(rit.id) : '', ritmoId: rit ? rit.id : '', ideias: ideias.map((x) => x.nome), extra };
}

function ideiasEmTexto(ids) {
  return ids.map((id) => TODAS_IDEIAS.find((x) => x.id === id)?.en).filter(Boolean).join(', ');
}

const ABA_DO_ESTILO = {
  reggae: 'Reggae e ska', gaucha: 'Gaúcho e nativista', forro: 'Nordeste', rock: 'Rock e metal', metal: 'Rock e metal',
  pagode: 'Samba e pagode', funk: 'Eletrônico', pop: 'Eletrônico', sertanejo: 'Guitarra', 'sertanejo-potente': 'Guitarra',
  soul: 'Metais e sopros', rnb: 'Teclados', jazz: 'Metais e sopros', 'blues-raiz': 'Guitarra', bossa: 'Guitarra', balada: 'Cordas e orquestra',
  rap: 'Eletrônico', trap: 'Eletrônico', eletronica: 'Eletrônico', axe: 'Ritmo e percussão', country: 'Guitarra',
};

function PainelIdeias({ selecionadas, setSelecionadas, estiloId }) {
  const [aba, setAba] = useState(IDEIAS[0].cat);
  useEffect(() => {
    if (estiloId && ABA_DO_ESTILO[estiloId]) setAba(ABA_DO_ESTILO[estiloId]);
  }, [estiloId]);
  const [aberto, setAberto] = useState(false);
  const alternar = (id) => setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const surpresa = () => {
    const pega = (cat, n) => {
      const itens = [...(IDEIAS.find((c) => c.cat === cat)?.itens || [])].sort(() => Math.random() - 0.5);
      return itens.slice(0, n).map((x) => x.id);
    };
    setSelecionadas([
      ...pega('Guitarra', 1), ...pega('Metais e sopros', 1), ...pega('Teclados', 1),
      ...pega('Arranjo e estrutura', 2), ...pega('Clima e produção', 1),
    ]);
    setAberto(true);
  };
  const categoria = IDEIAS.find((c) => c.cat === aba);

  return (
    <div className="ide">
      <div className="ide-top">
        <button className="ide-abrir" onClick={() => setAberto(!aberto)}>
          🎛 Instrumentos, solos e arranjo {selecionadas.length ? <b>{selecionadas.length}</b> : null} <span>{aberto ? '▲' : '▼'}</span>
        </button>
        <button className="ide-dado" title="Sortear uma combinação" onClick={surpresa}>🎲</button>
      </div>

      {selecionadas.length > 0 && (
        <div className="ide-sel">
          {selecionadas.map((id) => {
            const it = TODAS_IDEIAS.find((x) => x.id === id);
            return it ? <button key={id} onClick={() => alternar(id)}>{it.nome} ✕</button> : null;
          })}
          <button className="ide-limpar" onClick={() => setSelecionadas([])}>limpar</button>
        </div>
      )}

      {aberto && (
        <div className="ide-corpo">
          <div className="ide-rot">Receitas prontas</div>
          <div className="ide-receitas">
            {RECEITAS.map((r) => (
              <button key={r.nome} onClick={() => setSelecionadas(r.ids)}>{r.nome}</button>
            ))}
          </div>

          <div className="ide-abas">
            {IDEIAS.map((c) => {
              const n = c.itens.filter((x) => selecionadas.includes(x.id)).length;
              return (
                <button key={c.cat} className={aba === c.cat ? 'on' : ''} onClick={() => setAba(c.cat)}>
                  {c.emoji} {c.cat}{n ? ` (${n})` : ''}
                </button>
              );
            })}
          </div>
          <div className="ide-itens">
            {categoria.itens.map((x) => (
              <button key={x.id} className={selecionadas.includes(x.id) ? 'on' : ''} onClick={() => alternar(x.id)}>{x.nome}</button>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .ide { margin-top: 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 8px; }
        .ide-top { display: flex; gap: 6px; }
        .ide-abrir { flex: 1; display: flex; align-items: center; gap: 8px; background: none; border: 0; color: var(--text); font: inherit; font-weight: 600; font-size: 14px; padding: 6px; cursor: pointer; text-align: left; }
        .ide-abrir b { background: var(--gold); color: #1a1407; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
        .ide-abrir span { margin-left: auto; color: var(--text-muted); font-size: 11px; }
        .ide-dado { background: var(--gold-soft); border: 1px solid var(--gold); border-radius: 8px; width: 38px; cursor: pointer; font-size: 17px; }
        .ide-sel { display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 4px 2px; }
        .ide-sel button { background: var(--gold-soft); border: 1px solid var(--gold); color: var(--gold); border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
        .ide-sel .ide-limpar { background: none; border-color: transparent; color: var(--text-muted); text-decoration: underline; }
        .ide-corpo { padding: 6px 4px 4px; }
        .ide-rot { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin: 6px 0; }
        .ide-receitas { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
        .ide-receitas button { background: var(--bg-elevated); border: 1px dashed var(--gold); color: var(--text); border-radius: 8px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
        .ide-abas { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 6px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
        .ide-abas button { white-space: nowrap; background: none; border: 0; color: var(--text-muted); padding: 6px 8px; border-radius: 6px; font-size: 13px; cursor: pointer; }
        .ide-abas button.on { background: var(--bg-elevated); color: var(--gold); font-weight: 600; }
        .ide-itens { display: flex; flex-wrap: wrap; gap: 5px; }
        .ide-itens button { background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 6px 11px; font-size: 13px; cursor: pointer; }
        .ide-itens button.on { border-color: var(--gold); background: var(--gold-soft); color: var(--gold); }
      `}</style>
    </div>
  );
}

function EstilosDoMedley({ medley, biblioteca }) {
  const faixas = (medley.faixas || []).map((f, i) => {
    let estilo = f.estiloNome || '';
    let ideias = f.ideiasNomes || null;
    let ritmo = f.ritmoNome;
    if (!estilo || !ideias || ritmo === undefined) {
      // medleys antigos: busca a música original na biblioteca
      const orig = biblioteca.find((x) => x.id === f.id);
      const d = descreverEstilo(orig?.estilo || '');
      estilo = estilo || d.estilo || d.extra || '—';
      ideias = ideias || d.ideias;
      ritmo = ritmo === undefined ? d.ritmo : ritmo;
    }
    return { n: i + 1, titulo: f.titulo, estilo, ritmo, ideias };
  });
  const ideiasTodas = [...new Set(faixas.flatMap((f) => f.ideias || []))];

  return (
    <div className="med-est">
      <div className="med-est-rot">🎼 Estilos escolhidos</div>
      <div className="med-est-lista">
        {faixas.map((f) => (
          <div key={f.n} className="med-est-item">
            <span className="med-est-n">{f.n}</span>
            <span className="med-est-nome">{f.estilo}{f.ritmo ? <span className="med-est-rit">{f.ritmo}</span> : null}</span>
            {f.titulo && <span className="med-est-tit">{f.titulo}</span>}
          </div>
        ))}
      </div>
      {ideiasTodas.length > 0 && (
        <>
          <div className="med-est-rot">🎛 Instrumentos e arranjo</div>
          <div className="med-est-ideias">
            {ideiasTodas.map((x) => <span key={x}>{x}</span>)}
          </div>
        </>
      )}
      <style jsx>{`
        .med-est { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 10px; }
        .med-est-rot { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-bottom: 8px; }
        .med-est-ideias { margin-top: 0; }
        .med-est-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; margin-bottom: 10px; }
        .med-est-item { display: grid; grid-template-columns: 24px 1fr; column-gap: 8px; align-items: center; background: var(--bg-elevated); border-radius: 8px; padding: 8px 10px; }
        .med-est-n { grid-row: span 2; width: 24px; height: 24px; border-radius: 50%; background: var(--gold-soft); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
        .med-est-nome { font-weight: 600; color: var(--gold); font-size: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .med-est-rit { font-size: 11px; font-weight: 600; color: var(--text); background: var(--teal-soft); border-radius: 999px; padding: 2px 8px; }
        .med-est-tit { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .med-est-ideias { display: flex; flex-wrap: wrap; gap: 5px; }
        .med-est-ideias span { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
      `}</style>
    </div>
  );
}

const VOZES = [
  { id: 'masculina', nome: 'Masculina' },
  { id: 'masc-potente', nome: 'Masculina potente' },
  { id: 'masc-suave', nome: 'Masculina suave' },
  { id: 'masc-rouca', nome: 'Masculina rouca' },
  { id: 'feminina', nome: 'Feminina' },
  { id: 'fem-potente', nome: 'Feminina potente' },
  { id: 'fem-suave', nome: 'Feminina suave' },
  { id: 'dupla', nome: 'Dupla sertaneja' },
  { id: 'dueto', nome: 'Dueto (homem e mulher)' },
  { id: 'coral', nome: 'Com coral' },
];

const MOTORES = [
  { id: 'elevenlabs', nome: 'ElevenLabs', desc: '2 versões · oficial · ~R$3-5 cada' },
  { id: 'lyria', nome: 'Google Lyria', desc: '2 versões · oficial · ~R$0,50-1 cada' },
  { id: 'comparar', nome: 'Comparar', desc: '1 de cada motor, lado a lado' },
];

// ───────────────────────── Auxiliares ─────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let d = {};
  try { d = await r.json(); } catch { /* sem json */ }
  if (!r.ok || d.erro || d.error) throw new Error(d.erro || d.error || `Erro ${r.status}`);
  return d;
}

function fmtTempo(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function nomeMotor(m) {
  if (m === 'medley') return 'Medley';
  return { lyria: 'Lyria', suno: 'Suno', nuivi: 'Nuivi', outra: 'Importada' }[m] || 'ElevenLabs';
}

const MEDLEY_PADRAO = [
  { estiloId: 'gospel', tema: '', ritmo: 'media' },
  { estiloId: 'sertanejo', tema: '', ritmo: 'media' },
  { estiloId: 'forro', tema: '', ritmo: 'animada' },
  { estiloId: 'pagode', tema: '', ritmo: 'animada' },
];

// Roda tarefas com no máximo N ao mesmo tempo
async function emLotes(itens, n, fn) {
  const res = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; res[k] = await fn(itens[k], k); }
  }));
  return res;
}

function arquivoNome(t, ext = 'mp3') {
  return `${(t || 'musica').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'musica'}.${ext}`;
}

async function baixar(url, nome) {
  try {
    const blob = await fetch(url).then((r) => r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, '_blank');
  }
}

// ───────────────────────── Página ─────────────────────────

export default function EstudioMusica() {
  // Criação
  const [modo, setModo] = useState('simples');
  const [motor, setMotor] = useState('elevenlabs');
  const [descricao, setDescricao] = useState('');
  const [titulo, setTitulo] = useState('');
  const [letra, setLetra] = useState('');
  const [temaLetra, setTemaLetra] = useState('');
  const [estiloId, setEstiloId] = useState('gospel');
  const [estiloExtra, setEstiloExtra] = useState('');
  const [referencia, setReferencia] = useState(''); // "parecido com" (artista/banda)
  const [refInfo, setRefInfo] = useState(null); // { de, estilo, voz, resumo }
  const [analisandoRef, setAnalisandoRef] = useState(false);
  const [ideias, setIdeias] = useState([]);
  const [ritmo, setRitmo] = useState('');
  const [voz, setVoz] = useState('masculina');
  const [idioma, setIdioma] = useState('pt'); // 'pt' | 'en' = letra e canto em inglês
  const [instrumental, setInstrumental] = useState(false);
  const [duracao, setDuracao] = useState(150);
  const [escrevendo, setEscrevendo] = useState(false);
  const [gerando, setGerando] = useState([]); // [{ chave, motor, inicio, erro }]
  const [aviso, setAviso] = useState('');
  // Caixa de pergunta da própria página (o window.prompt não existe no app de PC, e o clique ficava sem resposta)
  const [pergunta, setPergunta] = useState(null); // { titulo, nota, botao, campos: [{ chave, rotulo, valor, dica }], resolver }
  function perguntar(titulo, campos, { nota = '', botao = 'Continuar' } = {}) {
    return new Promise((resolver) => setPergunta({ titulo, nota, botao, campos: campos.map((c) => ({ ...c, valor: c.valor || '' })), resolver }));
  }
  function responderPergunta(ok) {
    if (!pergunta) return;
    const r = ok ? Object.fromEntries(pergunta.campos.map((c) => [c.chave, c.valor.trim()])) : null;
    if (ok && pergunta.campos.some((c) => c.obrigatorio && !c.valor.trim())) return;
    pergunta.resolver(r);
    setPergunta(null);
  }

  // Medley
  const [medTitulo, setMedTitulo] = useState('');
  const [medTema, setMedTema] = useState('');
  const [medFaixas, setMedFaixas] = useState(MEDLEY_PADRAO);
  const [crossfade, setCrossfade] = useState(3);
  const [medProgresso, setMedProgresso] = useState(null); // { titulo, etapas: [{nome, status}], fase, erro }

  // Seleção para juntar
  const [selecionando, setSelecionando] = useState(false);
  const [selecao, setSelecao] = useState([]); // ids em ordem
  const [importando, setImportando] = useState(null); // { origem, status } enquanto o painel de importar está aberto
  const [editandoLetra, setEditandoLetra] = useState(null); // { id, letra, estilo, instrumental }
  const [marcadas, setMarcadas] = useState([]); // músicas marcadas para "Nova versão" em lote
  const [versoesLote, setVersoesLote] = useState(1);
  const [motorLote, setMotorLote] = useState('elevenlabs'); // '' = mesmo motor da música original
  const [loteRodando, setLoteRodando] = useState('');
  const [preparando, setPreparando] = useState([]); // ids no pacote do Spotify em andamento (mostra o andamento no próprio botão)

  // Biblioteca
  const [musicas, setMusicas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(null); // id do card expandido
  const [trabalho, setTrabalho] = useState({}); // { [id]: 'mensagem' }

  // Player
  const audioRef = useRef(null);
  const [tocando, setTocando] = useState(null); // música
  const [pausado, setPausado] = useState(true);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [agora, setAgora] = useState(Date.now());
  const [volume, setVolume] = useState(0.8);
  const [mudo, setMudo] = useState(false);

  // Lembra o volume escolhido neste navegador
  useEffect(() => {
    try {
      const v = parseFloat(localStorage.getItem('estudio-volume'));
      if (!Number.isNaN(v)) setVolume(Math.max(0, Math.min(1, v)));
    } catch { /* sem armazenamento */ }
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = mudo;
    }
    try { localStorage.setItem('estudio-volume', String(volume)); } catch { /* sem armazenamento */ }
  }, [volume, mudo, tocando]);

  function mudarVolume(v) {
    setVolume(v);
    if (v > 0 && mudo) setMudo(false);
  }

  const estiloTexto = useMemo(() => {
    const base = ESTILOS.find((e) => e.id === estiloId)?.base || '';
    const ref = refInfo && refInfo.de === referencia.trim() ? [refInfo.estilo, refInfo.voz ? `vocals: ${refInfo.voz}` : ''] : [];
    return [base, ...ref, ritmoEn(ritmo), ideiasEmTexto(ideias), estiloExtra.trim()].filter(Boolean).join(', ');
  }, [estiloId, estiloExtra, ideias, ritmo, refInfo, referencia]);

  // "Parecido com": a IA descreve o som do artista sem citar nomes (os motores recusam nomes)
  async function analisarReferencia() {
    const de = referencia.trim();
    if (!de) { setRefInfo(null); return null; }
    if (refInfo && refInfo.de === de) return refInfo;
    setAnalisandoRef(true);
    try {
      const d = await api('/api/estudio/letra', { method: 'POST', body: JSON.stringify({ acao: 'referencia', referencia: de }) });
      const info = { de, ...d };
      setRefInfo(info);
      return info;
    } catch (e) {
      setAviso(e.message);
      return null;
    } finally {
      setAnalisandoRef(false);
    }
  }

  const nomesIdeias = ideias.map((id) => TODAS_IDEIAS.find((x) => x.id === id)?.nome).filter(Boolean).join(', ');

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!gerando.length) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [gerando.length]);

  async function carregar() {
    setCarregando(true);
    try {
      const d = await api('/api/estudio/biblioteca');
      setMusicas(d.musicas || []);
    } catch (e) {
      setAviso(`Não consegui carregar a biblioteca: ${e.message}`);
    } finally {
      setCarregando(false);
    }
  }

  function atualizarLocal(id, campos) {
    setMusicas((ms) => ms.map((m) => (m.id === id ? { ...m, ...campos } : m)));
    setTocando((t) => (t && t.id === id ? { ...t, ...campos } : t));
  }

  // ── Letra com IA ──
  async function escreverLetra(melhorar) {
    setAviso('');
    setEscrevendo(true);
    try {
      const d = await api('/api/estudio/letra', {
        method: 'POST',
        body: JSON.stringify({
          acao: 'letra',
          tema: temaLetra || titulo,
          estilo: ESTILOS.find((e) => e.id === estiloId)?.nome,
          voz: VOZES.find((v) => v.id === voz)?.nome,
          idioma,
          detalhes: nomesIdeias,
          referencia: referencia.trim(),
          letraAtual: melhorar ? letra : '',
        }),
      });
      setLetra(d.letra);
      // letra passada para o inglês: o título acompanha (a distribuidora quer título e capa iguais)
      if (d.titulo && (!titulo || (melhorar && idioma === 'en'))) setTitulo(d.titulo);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setEscrevendo(false);
    }
  }

  // ── Criar música ──
  async function criar(parametrosFixos) {
    setAviso('');
    let estiloFinal = estiloTexto;
    if (!parametrosFixos && referencia.trim() && !(refInfo && refInfo.de === referencia.trim())) {
      const info = await analisarReferencia();
      if (info) {
        const base = ESTILOS.find((e) => e.id === estiloId)?.base || '';
        estiloFinal = [base, info.estilo, info.voz ? `vocals: ${info.voz}` : '', ritmoEn(ritmo), ideiasEmTexto(ideias), estiloExtra.trim()].filter(Boolean).join(', ');
      }
    }
    const p = parametrosFixos || {
      modo,
      descricao,
      titulo,
      letra,
      estilo: estiloFinal,
      voz: instrumental ? '' : voz,
      idioma,
      instrumental,
      duracaoSeg: duracao,
    };
    if (p.modo === 'simples' && !p.descricao.trim()) { setAviso('Descreva a música que você quer.'); return; }
    if (p.modo === 'personalizado' && !p.instrumental && !p.letra.trim()) { setAviso('Escreva ou gere a letra primeiro (ou marque Instrumental).'); return; }

    const motorEscolhido = parametrosFixos?.motor || motor;
    const qtdVersoes = parametrosFixos?.qtdVersoes === 1 ? 1 : 2;
    const motores = motorEscolhido === 'comparar' ? ['elevenlabs', 'lyria'] : Array(qtdVersoes).fill(motorEscolhido);
    const grupoId = `g${Date.now()}`;
    const jobs = motores.map((m, i) => ({ chave: `${grupoId}-${i}`, motor: m, inicio: Date.now(), titulo: p.titulo || p.descricao }));
    setGerando((g) => [...jobs, ...g]);

    await Promise.all(jobs.map(async (job, i) => {
      try {
        const d = await api('/api/estudio/gerar', {
          method: 'POST',
          body: JSON.stringify({ ...p, qtdVersoes: undefined, motor: job.motor, grupoId, versao: i + 1 }),
        });
        setMusicas((ms) => [d.musica, ...ms]);
        setGerando((g) => g.filter((x) => x.chave !== job.chave));
      } catch (e) {
        setGerando((g) => g.map((x) => (x.chave === job.chave ? { ...x, erro: e.message } : x)));
      }
    }));
  }

  function variacao(m, qtdVersoes = 2, motorNovo = '') {
    return criar({
      qtdVersoes,
      motor: motorNovo || (m.motor === 'medley' ? 'elevenlabs' : m.motor),
      modo: m.modo,
      descricao: m.descricao || '',
      titulo: m.titulo,
      letra: m.letra || '',
      estilo: m.estilo || '',
      voz: m.voz || '',
      idioma: m.idioma || 'pt',
      instrumental: !!m.instrumental,
      duracaoSeg: m.duracaoSeg || 150,
    });
  }

  // Versão em inglês de uma música que já existe: a IA passa a letra para o inglês (versão cantável)
  // e o Estúdio gera a música de novo com o mesmo estilo e voz. A original continua na biblioteca.
  async function versaoEmIngles(m) {
    const temLetra = !!String(m.letra || '').trim();
    if (!temLetra && !(m.modo === 'simples' && String(m.descricao || '').trim())) {
      setAviso('Essa música está sem letra salva. Salve a letra em "📝 Letra e estilo" e tente de novo.');
      return;
    }
    const r = await perguntar(
      `🌎 Versão em inglês de "${m.titulo}"`,
      [{ chave: 'qtd', rotulo: 'Quantas versões gerar', valor: '1', opcoes: [{ valor: '1', rotulo: '1 versão' }, { valor: '2', rotulo: '2 versões' }] }],
      { botao: 'Criar em inglês', nota: 'É uma gravação nova: mesmo estilo e tipo de voz, com a letra em inglês. A melodia e a voz não ficam iguais às da original, que continua guardada. Gasta crédito como criar uma música.' },
    );
    if (!r) return;
    comTrabalho(m.id, 'Passando a letra para inglês…', async (etapa) => {
      let letraEn = '';
      let tituloEn = m.titulo;
      if (temLetra) {
        const d = await api('/api/estudio/letra', {
          method: 'POST',
          body: JSON.stringify({ acao: 'letra', idioma: 'en', tema: m.titulo, estilo: m.estilo, letraAtual: m.letra }),
        });
        letraEn = d.letra;
        if (d.titulo) tituloEn = d.titulo;
      }
      // O nome da música também vai para o inglês (a capa e a ficha usam esse nome)
      if (tituloEn === m.titulo) {
        try {
          const t = await api('/api/estudio/letra', { method: 'POST', body: JSON.stringify({ acao: 'tituloIngles', titulo: m.titulo }) });
          if (t.titulo) tituloEn = t.titulo;
        } catch { /* fica com o nome original */ }
      }
      etapa('Gerando a versão em inglês…');
      await criar({
        qtdVersoes: Number(r.qtd) === 2 ? 2 : 1,
        motor: m.motor === 'lyria' ? 'lyria' : 'elevenlabs',
        modo: letraEn ? 'personalizado' : 'simples',
        descricao: m.descricao || '',
        titulo: tituloEn,
        letra: letraEn,
        estilo: m.estilo || '',
        voz: m.voz || '',
        idioma: 'en',
        instrumental: false,
        duracaoSeg: m.duracaoSeg || 150,
      });

    });
  }

  // Nova versão de várias músicas de uma vez (mesma letra, estilo e voz)
  async function novaVersaoMarcadas() {
    const lista = musicas.filter((m) => marcadas.includes(m.id) && m.tipo !== 'medley' && !m.importada);
    if (!lista.length) return;
    const total = lista.length * versoesLote;
    if (!confirm(`Fazer nova versão de ${lista.length} música(s)? Vão ser geradas ${total} músicas (${versoesLote} de cada), gastando crédito.`)) return;
    setMarcadas([]);
    let feitas = 0;
    const fila = [...lista];
    setLoteRodando(`Criando 0 de ${lista.length}…`);
    const trabalhador = async () => {
      while (fila.length) {
        const m = fila.shift();
        await variacao(m, versoesLote, motorLote);
        feitas += 1;
        setLoteRodando(feitas < lista.length ? `Criando ${feitas} de ${lista.length}…` : '');
      }
    };
    // A ElevenLabs do seu plano aceita só 2 músicas ao mesmo tempo; o Lyria aguenta mais
    const usaEleven = motorLote === 'elevenlabs' || (!motorLote && lista.some((m) => m.motor !== 'lyria'));
    const vezes = usaEleven ? Math.max(1, Math.floor(2 / versoesLote)) : 3;
    await Promise.all(Array.from({ length: vezes }, trabalhador));
    setLoteRodando('');
  }

  // Baixa as músicas marcadas num arquivo .zip só (uma só: baixa o mp3 direto)
  async function baixarMarcadas() {
    const lista = musicas.filter((m) => marcadas.includes(m.id) && m.audioUrl);
    if (!lista.length) return;
    if (lista.length === 1) { baixar(lista[0].audioUrl, arquivoNome(lista[0].titulo, lista[0].audioUrl.includes('.wav') ? 'wav' : 'mp3')); return; }
    try {
      const { zipSync } = await import('fflate');
      const arquivos = {};
      for (let i = 0; i < lista.length; i++) {
        const m = lista[i];
        setLoteRodando(`Baixando ${i + 1} de ${lista.length}…`);
        const buf = new Uint8Array(await fetch(m.audioUrl).then((r) => { if (!r.ok) throw new Error(`não baixou "${m.titulo}"`); return r.arrayBuffer(); }));
        let nome = arquivoNome(m.titulo, m.audioUrl.includes('.wav') ? 'wav' : 'mp3');
        for (let n = 2; arquivos[nome]; n++) nome = nome.replace(/(-\d+)?\.(\w+)$/, `-${n}.$2`);
        arquivos[nome] = [buf, { level: 0 }]; // mp3 já é comprimido: só junta
      }
      setLoteRodando('Montando o arquivo .zip…');
      const zip = zipSync(arquivos);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      a.download = `musicas-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (e) {
      setAviso(`Não consegui juntar as músicas: ${e.message}`);
    } finally {
      setLoteRodando('');
    }
  }

  // Exclui as marcadas da biblioteca e apaga os arquivos (libera espaço)
  async function excluirMarcadas() {
    const ids = [...marcadas];
    if (!ids.length) return;
    if (!window.confirm(`Excluir ${ids.length} música(s) de vez? Os arquivos são apagados para liberar espaço e não dá para recuperar. Baixe antes se for usar.`)) return;
    setLoteRodando(`Excluindo ${ids.length}…`);
    try {
      const d = await api('/api/estudio/biblioteca', { method: 'POST', body: JSON.stringify({ acao: 'excluir', ids }) });
      setMusicas((ms) => ms.filter((x) => !ids.includes(x.id)));
      if (tocando && ids.includes(tocando.id)) { audioRef.current?.pause(); setTocando(null); }
      setMarcadas([]);
      setAviso(`${d.apagados} música(s) excluída(s).${d.mantidos?.length ? ` O áudio de ${d.mantidos.length} foi mantido porque ainda está sendo usado num vídeo ou medley em andamento.` : ''}`);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setLoteRodando('');
    }
  }

  // Pacote para a distribuidora: WAV, MP3, capa 3000×3000, letra e ficha (um .zip; várias músicas = uma pasta cada)
  async function prepararStreaming(lista) {
    if (!lista.length) return;
    let artista = '';
    let compositor = '';
    try { artista = localStorage.getItem('estudio-artista') || ''; compositor = localStorage.getItem('estudio-compositor') || ''; } catch { /* sem armazenamento */ }
    const fracas = lista.filter((m) => !avaliacao(m).pronta);
    const semCapa = lista.filter((m) => !m.capaUrl).length;
    const notas = [];
    if (fracas.length) notas.push(`⚠ ${fracas.length} música(s) ainda têm pontos para ajustar (veja em ⋯). Dá para preparar mesmo assim.`);
    if (lista.length > 10) notas.push(`São ${lista.length} músicas de uma vez: o pacote fica grande e pode demorar. Se travar, prepare de 10 em 10.`);
    const r = await perguntar(
      lista.length > 1 ? `📦 Preparar ${lista.length} músicas para streaming` : `📦 Preparar "${lista[0].titulo}" para o Spotify`,
      [
        { chave: 'artista', rotulo: 'Nome do intérprete / artista (um para cada ritmo, sempre escrito igual)', valor: artista || 'Aqui Tem Música', obrigatorio: true },
        { chave: 'compositor', rotulo: 'Seu nome completo (vai como compositor e produtor na ficha)', valor: compositor },
        {
          chave: 'capas',
          rotulo: `Capas: ${semCapa === lista.length ? 'nenhuma tem capa ainda' : semCapa ? `${semCapa} de ${lista.length} sem capa` : lista.length > 1 ? 'todas já têm capa' : 'já tem capa'} (cada capa nova gasta um pouco de crédito do Flux)`,
          valor: 'faltam',
          opcoes: [{ valor: 'faltam', rotulo: semCapa ? 'Criar só nas sem capa' : 'Manter as capas' }, { valor: 'todas', rotulo: lista.length > 1 ? 'Capa nova em todas' : 'Fazer capa nova' }],
        },
      ],
      { botao: 'Preparar pacote', nota: notas.join(' ') },
    );
    if (!r) return;
    artista = r.artista;
    compositor = r.compositor;
    try { localStorage.setItem('estudio-artista', artista); localStorage.setItem('estudio-compositor', compositor); } catch { /* sem armazenamento */ }
    setLoteRodando('Preparando o pacote…');
    setPreparando(lista.map((m) => m.id));
    try {
      const { Zip, ZipPassThrough } = await import('fflate');
      const partes = [];
      const zip = new Zip((err, pedaco) => { if (err) throw err; partes.push(pedaco); });
      const add = (nome, dados) => { const f = new ZipPassThrough(nome); zip.add(f); f.push(dados, true); };
      const texto = (t) => new TextEncoder().encode(t);
      for (let i = 0; i < lista.length; i++) {
        let m = lista[i];
        const pasta = lista.length > 1 ? `${String(i + 1).padStart(2, '0')}-${arquivoNome(m.titulo, '').replace(/\.$/, '')}/` : '';
        const etapa = (t) => setLoteRodando(`${lista.length > 1 ? `${i + 1}/${lista.length} · ` : ''}${t}`);
        if (!m.capaUrl || r.capas === 'todas') {
          etapa('Criando a capa…');
          try {
            const capaUrl = await criarCapa(m, etapa);
            m = { ...m, capaUrl };
          } catch { /* segue sem capa */ }
        }
        etapa('Baixando o áudio…');
        const audio = await fetch(m.audioUrl).then((r) => { if (!r.ok) throw new Error(`não baixou "${m.titulo}"`); return r.arrayBuffer(); });
        add(`${pasta}audio.mp3`, new Uint8Array(audio));
        etapa('Convertendo para WAV…');
        try { add(`${pasta}audio.wav`, await paraWav(audio)); } catch { /* fica só o mp3 */ }
        if (m.capaUrl) {
          etapa('Capas 1400 e 3000…');
          try {
            add(`${pasta}capa-1400.jpg`, await capaQuadrada(m.capaUrl, 1400));
            add(`${pasta}capa-3000.jpg`, await capaQuadrada(m.capaUrl, 3000));
          } catch {
            try { add(`${pasta}capa-original.jpg`, new Uint8Array(await fetch(m.capaUrl).then((r) => r.arrayBuffer()))); } catch { /* sem capa */ }
          }
        }
        if (!m.instrumental && m.letra) add(`${pasta}letra.txt`, texto(letraLimpa(m.letra)));
        add(`${pasta}ficha.txt`, texto(ficha(m, { artista, compositor, genero: generoStreaming(m) })));
      }
      zip.end();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(partes, { type: 'application/zip' }));
      const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      a.download = lista.length > 1 ? `spotify-${lista.length}-musicas.zip` : `spotify-${semAcento(arquivoNome(lista[0].titulo, 'zip'))}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 120000);
      setAviso(lista.length > 1 ? `Pacote pronto com ${lista.length} músicas, uma pasta para cada. Em cada pasta, abra a ficha.txt e siga os campos no site da distribuidora.` : 'Pacote pronto! Abra a ficha.txt e siga os campos no site da distribuidora.');
    } catch (e) {
      setAviso(`Não consegui preparar: ${e.message}`);
    } finally {
      setLoteRodando('');
      setPreparando([]);
    }
  }

  function reutilizar(m) {
    setModo(m.modo === 'personalizado' ? 'personalizado' : 'simples');
    setDescricao(m.descricao || '');
    setTitulo(m.titulo || '');
    setLetra(m.letra || '');
    setInstrumental(!!m.instrumental);
    if (m.voz) setVoz(m.voz);
    setIdioma(m.idioma === 'en' ? 'en' : 'pt');
    if (m.duracaoSeg) setDuracao(m.duracaoSeg);
    let resto = m.estilo || '';
    const achado = ESTILOS.find((e) => resto.startsWith(e.base));
    if (achado) {
      setEstiloId(achado.id);
      resto = resto.slice(achado.base.length);
    }
    const rit = acharRitmo(resto);
    setRitmo(rit ? rit.id : '');
    if (rit) resto = resto.replace(rit.texto, '');
    const achadas = TODAS_IDEIAS.filter((x) => resto.includes(x.en));
    achadas.forEach((x) => { resto = resto.replace(x.en, ''); });
    setIdeias(achadas.map((x) => x.id));
    setEstiloExtra(resto.split(',').map((t) => t.trim()).filter(Boolean).join(', '));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Medley: gera N músicas e junta ──
  async function criarMedley() {
    setAviso('');
    if (medFaixas.length < 2) { setAviso('Coloque pelo menos 2 músicas no medley.'); return; }
    if (!medTema.trim() && medFaixas.some((f) => !f.tema.trim())) {
      setAviso('Escreva o tema geral do medley (ou um tema em cada música).');
      return;
    }
    const motorMed = motor === 'comparar' ? 'elevenlabs' : motor;
    const grupoId = `m${Date.now()}`;
    const tituloMed = medTitulo.trim() || `Medley ${medFaixas.map((f) => ESTILOS.find((e) => e.id === f.estiloId)?.nome.split(' ')[0]).join(', ')}`;
    const etapas = medFaixas.map((f, i) => ({ nome: `${i + 1}. ${ESTILOS.find((e) => e.id === f.estiloId)?.nome}`, status: 'esperando' }));
    setMedProgresso({ titulo: tituloMed, etapas, fase: 'musicas', erro: '' });
    const marcar = (k, status) => setMedProgresso((p) => p && ({ ...p, etapas: p.etapas.map((e, i) => (i === k ? { ...e, status } : e)) }));
    const plano = {
      titulo: tituloMed,
      motor: motorMed,
      grupoId,
      faixas: medFaixas.map((f) => ({ ...f })),
      ideias: [...ideias],
      estiloExtra: estiloExtra.trim(),
      voz,
      duracao,
      crossfade,
      tema: medTema,
      prontas: [],
    };
    await rodarMedley(plano, medFaixas.map((_, i) => i), marcar);
  }

  // Gera as músicas que faltam (com novas tentativas) e junta as que ficaram prontas
  async function rodarMedley(plano, indices, marcar) {
    const umaFaixa = async (k) => {
      const f = plano.faixas[k];
      const est = ESTILOS.find((e) => e.id === f.estiloId) || ESTILOS[0];
      const nomesIdeiasPlano = plano.ideias.map((id) => TODAS_IDEIAS.find((x) => x.id === id)?.nome).filter(Boolean);
      let ultimoErro = '';
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
          marcar(k, tentativa > 1 ? 'tentando de novo: letra…' : 'escrevendo a letra…');
          const l = await api('/api/estudio/letra', {
            method: 'POST',
            body: JSON.stringify({
              acao: 'letra',
              tema: plano.ideiasFaixas?.[k]
                ? `${plano.ideiasFaixas[k].angulo} (título sugerido: "${plano.ideiasFaixas[k].titulo}"; tema geral do medley: ${plano.tema || f.tema})`
                : (f.tema.trim() || plano.tema),
              evitar: plano.faixas.map((_, i) => i).filter((i) => i !== k).map((i) => {
                const pr = plano.prontas[i];
                if (pr) return `"${pr.titulo}"`;
                const id = plano.ideiasFaixas?.[i];
                return id ? `"${id.titulo}" — ${id.angulo}` : `música ${i + 1}`;
              }),
              estilo: [est.nome, f.ritmo ? `ritmo ${RITMOS.find((r) => r.id === f.ritmo)?.nome.toLowerCase()}` : ''].filter(Boolean).join(', '),
              voz: VOZES.find((v) => v.id === plano.voz)?.nome,
              detalhes: nomesIdeiasPlano.join(', '),
            }),
          });
          marcar(k, tentativa > 1 ? 'tentando de novo: música…' : 'criando a música…');
          const d = await api('/api/estudio/gerar', {
            method: 'POST',
            body: JSON.stringify({
              motor: plano.motor,
              modo: 'personalizado',
              titulo: l.titulo || `${plano.titulo} ${k + 1}`,
              letra: l.letra,
              estilo: [est.base, ritmoEn(f.ritmo), ideiasEmTexto(plano.ideias), plano.estiloExtra].filter(Boolean).join(', '),
              voz: plano.voz,
              instrumental: false,
              duracaoSeg: plano.duracao,
              grupoId: plano.grupoId,
              versao: k + 1,
            }),
          });
          setMusicas((ms) => [d.musica, ...ms]);
          marcar(k, 'pronta ✓');
          plano.prontas[k] = { ...d.musica, estiloNome: est.nome, ritmoNome: nomeRitmo(f.ritmo), ideiasNomes: nomesIdeiasPlano };
          return;
        } catch (e) {
          ultimoErro = e.message;
        }
      }
      marcar(k, `falhou ✕ (${ultimoErro.slice(0, 80)})`);
    };

    setMedProgresso((p) => p && ({ ...p, fase: 'musicas', erro: '', falhas: [] }));

    // 1º passo: planejar um título e um assunto diferente para cada música
    if (!plano.ideiasFaixas) {
      plano.faixas.forEach((_, k) => marcar(k, 'planejando…'));
      try {
        const pl = await api('/api/estudio/letra', {
          method: 'POST',
          body: JSON.stringify({
            acao: 'planoMedley',
            tema: plano.tema,
            faixas: plano.faixas.map((f) => ({
              estilo: ESTILOS.find((e) => e.id === f.estiloId)?.nome,
              ritmo: f.ritmo ? RITMOS.find((r) => r.id === f.ritmo)?.nome.toLowerCase() : '',
              tema: f.tema.trim(),
            })),
          }),
        });
        plano.ideiasFaixas = pl.ideias;
        setMedProgresso((p) => p && ({
          ...p,
          etapas: p.etapas.map((e, i) => ({ ...e, nome: `${i + 1}. ${pl.ideias[i]?.titulo || ''} · ${ESTILOS.find((x) => x.id === plano.faixas[i].estiloId)?.nome}`, status: 'esperando' })),
        }));
      } catch (e) {
        plano.ideiasFaixas = plano.faixas.map(() => null); // segue sem plano, mas avisando para variar
      }
    }

    await emLotes(indices, 2, umaFaixa);

    const falhas = plano.faixas.map((_, i) => i).filter((i) => !plano.prontas[i]);
    const prontas = plano.prontas.filter(Boolean);

    if (falhas.length) {
      setMedProgresso((p) => p && ({
        ...p,
        plano,
        falhas,
        erro: `${falhas.length} música(s) não saíram. Você pode tentar de novo só essas, ou juntar as ${prontas.length} que ficaram prontas.`,
      }));
      return;
    }
    await juntarPlano(plano);
  }

  async function juntarPlano(plano) {
    const prontas = plano.prontas.filter(Boolean);
    if (prontas.length < 2) { setAviso('Precisa de pelo menos 2 músicas prontas para juntar.'); return; }
    setMedProgresso((p) => p && ({ ...p, fase: 'juntando', erro: '', falhas: [] }));
    try {
      const d = await api('/api/estudio/juntar', {
        method: 'POST',
        body: JSON.stringify({ titulo: plano.titulo, faixas: prontas, crossfade: plano.crossfade }),
      });
      setMusicas((ms) => [d.musica, ...ms]);
      setMedProgresso(null);
      setAberta(d.musica.id);
      setAviso(`Medley "${plano.titulo}" pronto! As músicas separadas também ficaram na biblioteca.`);
    } catch (e) {
      setMedProgresso((p) => p && ({ ...p, plano, erro: `Erro ao juntar: ${e.message}`, falhas: [] }));
    }
  }

  function tentarFalhasDeNovo() {
    const p = medProgresso;
    if (!p?.plano) return;
    const marcar = (k, status) => setMedProgresso((x) => x && ({ ...x, etapas: x.etapas.map((e, i) => (i === k ? { ...e, status } : e)) }));
    rodarMedley(p.plano, p.falhas, marcar);
  }

  function alternarSelecao(id) {
    setSelecao((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function juntarSelecionadas() {
    const faixas = selecao.map((id) => musicas.find((m) => m.id === id)).filter(Boolean).map((m) => {
      const d = descreverEstilo(m.estilo);
      return { ...m, estiloNome: d.estilo || d.extra, ritmoNome: d.ritmo, ideiasNomes: d.ideias };
    });
    if (faixas.length < 2) { setAviso('Selecione pelo menos 2 músicas.'); return; }
    const rt = await perguntar('Juntar em um medley', [{ chave: 'titulo', rotulo: 'Título do medley', valor: `Medley com ${faixas.length} músicas` }], { botao: 'Juntar' });
    if (!rt) return;
    const t = rt.titulo || `Medley com ${faixas.length} músicas`;
    setMedProgresso({ titulo: t, etapas: faixas.map((f, i) => ({ nome: `${i + 1}. ${f.titulo}`, status: 'pronta ✓' })), fase: 'juntando', erro: '' });
    try {
      const d = await api('/api/estudio/juntar', { method: 'POST', body: JSON.stringify({ titulo: t, faixas, crossfade }) });
      setMusicas((ms) => [d.musica, ...ms]);
      setMedProgresso(null);
      setSelecao([]);
      setSelecionando(false);
      setAberta(d.musica.id);
    } catch (e) {
      setMedProgresso((p) => p && ({ ...p, erro: e.message }));
    }
  }

  function mandarParaMedleyCanal(m) {
    const faixas = m.faixas || [];
    if (faixas.some((f) => !f.letra || !f.letra.trim())) {
      setAviso('O Medley do canal precisa da letra de todas as músicas, e alguma faixa está sem letra.');
      return;
    }
    if (!window.confirm(`Mandar "${m.titulo}" (${faixas.length} músicas) para o Medley do canal? Ele vira vídeo e entra na fila de publicação.`)) return;
    comTrabalho(m.id, 'Mandando para o Medley do canal…', async (msg) => {
      const c = await api('/api/medley-criar', {
        method: 'POST',
        body: JSON.stringify({ titulo: m.titulo, estilo: 'cinematografico', formato: 'longo', textoThumbnail: (m.titulo || '').toUpperCase().slice(0, 40), ambiente: 'production' }),
      });
      for (let i = 0; i < faixas.length; i++) {
        msg(`Enviando música ${i + 1} de ${faixas.length}…`);
        await api('/api/medley-adicionar-musica', { method: 'POST', body: JSON.stringify({ medleyId: c.id, audioUrl: faixas[i].audioUrl, letra: faixas[i].letra }) });
      }
      await api('/api/medley-finalizar', { method: 'POST', body: JSON.stringify({ medleyId: c.id }) });
      setAviso(`"${m.titulo}" foi para o Medley do canal. Acompanhe o vídeo na tela Medley.`);
    });
  }

  // ── Player ──
  function tocar(m) {
    const a = audioRef.current;
    if (!a) return;
    // Celular (principalmente iPhone): o play tem que sair direto do toque, e se falhar a gente avisa
    const falhou = (e) => {
      if (e && e.name === 'AbortError') return; // trocou de música no meio: normal
      setAviso(`O celular não conseguiu tocar "${m.titulo}" aqui (${e?.message || 'erro'}). Toque em "Abrir áudio" no player para ouvir direto.`);
    };
    if (tocando && tocando.id === m.id) {
      if (a.paused) a.play().catch(falhou); else a.pause();
      return;
    }
    setTocando(m);
    a.src = m.audioUrl;
    a.load();
    a.play().catch(falhou);
  }

  // ── Ações da biblioteca ──
  async function favoritar(m) {
    atualizarLocal(m.id, { favorito: !m.favorito });
    try { await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, favorito: !m.favorito }) }); } catch (e) { setAviso(e.message); }
  }

  async function renomear(m) {
    const rn = await perguntar('Renomear música', [{ chave: 'titulo', rotulo: 'Novo título', valor: m.titulo, obrigatorio: true }], { botao: 'Salvar' });
    const novo = rn?.titulo;
    if (!novo || novo === m.titulo) return;
    atualizarLocal(m.id, { titulo: novo });
    try { await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, titulo: novo }) }); } catch (e) { setAviso(e.message); return; }
    // O título da capa acompanha o nome novo (a distribuidora recusa capa com texto diferente do título)
    if (m.capaArteUrl) comTrabalho(m.id, 'Atualizando o título na capa…', () => porTitulo(m, m.capaArteUrl, novo));
    else if (m.capaUrl) setAviso('Nome trocado. Se a capa tem o nome antigo escrito, troque a capa: a distribuidora recusa capa com texto diferente do título.');
  }

  async function excluir(m) {
    if (!window.confirm(`Excluir "${m.titulo}" de vez? O arquivo é apagado para liberar espaço.`)) return;
    setMusicas((ms) => ms.filter((x) => x.id !== m.id));
    if (tocando?.id === m.id) { audioRef.current?.pause(); setTocando(null); }
    try { await api(`/api/estudio/biblioteca?id=${m.id}`, { method: 'DELETE' }); } catch (e) { setAviso(e.message); }
  }

  async function comTrabalho(id, msg, fn) {
    setTrabalho((t) => ({ ...t, [id]: msg }));
    try {
      await fn((nova) => setTrabalho((t) => ({ ...t, [id]: nova })));
    } catch (e) {
      setAviso(e.message);
    } finally {
      setTrabalho((t) => { const n = { ...t }; delete n[id]; return n; });
    }
  }

  // Aumenta a música: o áudio original fica igual e a IA gera só o trecho novo antes do final.
  // Cria uma versão nova na biblioteca; a original continua lá.
  async function aumentar(m) {
    const r = await perguntar(
      `⏩ Aumentar "${m.titulo}"`,
      [{ chave: 'extra', rotulo: 'Quanto aumentar', valor: '30', opcoes: [{ valor: '30', rotulo: '+30 s' }, { valor: '60', rotulo: '+1 min' }, { valor: '90', rotulo: '+1 min 30' }] }],
      { botao: 'Aumentar', nota: 'O começo da música fica igual. Entra mais um refrão (e estrofe, nas opções maiores) antes do final. A voz pode variar um pouco no trecho novo. Gasta crédito da ElevenLabs parecido com gerar a música de novo.' + (m.importada ? ' Nesta música importada, o trecho novo é feito pela ElevenLabs' + (String(m.letra || '').trim() ? '.' : '; como ela está sem letra salva, pode sair só instrumental (salve a letra em 📝 Letra e estilo antes).') : '') },
    );
    if (!r) return;
    comTrabalho(m.id, 'Aumentando a música… (1 a 3 min)', async () => {
      const d = await api('/api/estudio/aumentar', { method: 'POST', body: JSON.stringify({ id: m.id, extraSeg: Number(r.extra) }) });
      setMusicas((ms) => [d.musica, ...ms]);
      setAviso(`Pronto: "${d.musica.titulo}" agora tem ${fmtTempo(d.musica.duracaoSeg)}. Ela entrou no topo da lista; a original continua guardada.`);
    });
  }

  // Escreve o nome da música por cima da arte e guarda as duas: a capa (com título) e a arte limpa,
  // que serve para refazer o título quando a música muda de nome.
  async function porTitulo(m, arteUrl, titulo = m.titulo) {
    const blob = await capaComTitulo(arteUrl, titulo);
    const { upload } = await import('@vercel/blob/client');
    const r = await upload(`estudio-musica/capas/${Date.now()}-titulo.jpg`, blob, { access: 'public', handleUploadUrl: '/api/imagem-upload', contentType: 'image/jpeg' });
    await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, capaUrl: r.url, capaArteUrl: arteUrl }) });
    atualizarLocal(m.id, { capaUrl: r.url, capaArteUrl: arteUrl });
    return r.url;
  }

  // Capa nova: a IA desenha a arte a partir da letra e o Estúdio escreve o título por cima
  async function criarCapa(m, etapa = () => {}) {
    const d = await api('/api/estudio/capa', {
      method: 'POST',
      body: JSON.stringify({ id: m.id, titulo: m.titulo, estilo: m.estilo, descricao: m.descricao }),
    });
    atualizarLocal(m.id, { capaUrl: d.capaUrl, capaArteUrl: '' });
    try {
      etapa('Escrevendo o título na capa…');
      return await porTitulo(m, d.capaUrl);
    } catch (e) {
      setAviso(`A capa foi criada, mas não consegui escrever o título nela: ${e.message}`);
      return d.capaUrl;
    }
  }

  function gerarCapa(m) {
    comTrabalho(m.id, 'Criando a capa…', (etapa) => criarCapa(m, etapa));
  }

  function tituloNaCapa(m) {
    comTrabalho(m.id, 'Escrevendo o título na capa…', () => porTitulo(m, m.capaArteUrl || m.capaUrl));
  }

  function tirarTituloDaCapa(m) {
    comTrabalho(m.id, 'Tirando o título da capa…', async () => {
      await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, capaUrl: m.capaArteUrl, capaArteUrl: '' }) });
      atualizarLocal(m.id, { capaUrl: m.capaArteUrl, capaArteUrl: '' });
    });
  }

  // Capa própria: corta em quadrado, deixa em até 3000×3000 e guarda na música
  function enviarCapa(m, arquivo) {
    if (!arquivo) return;
    comTrabalho(m.id, 'Enviando a sua capa…', async () => {
      const img = await new Promise((ok, erro) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => erro(new Error('Não consegui abrir essa imagem. Use JPG ou PNG.'));
        i.src = URL.createObjectURL(arquivo);
      });
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      const tam = Math.min(3000, Math.max(1024, lado));
      const c = document.createElement('canvas');
      c.width = tam;
      c.height = tam;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, tam, tam);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
      const { upload } = await import('@vercel/blob/client');
      const r = await upload(`estudio-musica/capas/${Date.now()}.jpg`, blob, { access: 'public', handleUploadUrl: '/api/imagem-upload', contentType: 'image/jpeg' });
      await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, capaUrl: r.url, capaArteUrl: '' }) });
      atualizarLocal(m.id, { capaUrl: r.url, capaArteUrl: '' });
      if (lado < 1500) setAviso('Capa enviada. Ela é pequena (menos de 1500 px): vai ser aumentada para 3000×3000, mas pode ficar um pouco sem nitidez.');
    });
  }

  // Traz músicas feitas em outra plataforma (Suno, Nuivi...): envia os arquivos e põe na biblioteca
  async function importarArquivos(arquivos) {
    const lista = [...(arquivos || [])].filter((f) => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name));
    if (!lista.length) { setAviso('Escolha arquivos de áudio (MP3, WAV, M4A...).'); return; }
    const origem = importando?.origem || 'suno';
    const { upload } = await import('@vercel/blob/client');
    let feitas = 0;
    const falhas = [];
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      setImportando({ origem, status: `Enviando ${i + 1} de ${lista.length}: ${f.name}` });
      try {
        // duração lida do próprio arquivo
        const duracaoSeg = await new Promise((ok) => {
          const a = new Audio();
          a.preload = 'metadata';
          a.onloadedmetadata = () => ok(isFinite(a.duration) ? a.duration : 0);
          a.onerror = () => ok(0);
          a.src = URL.createObjectURL(f);
        });
        const ext = (f.name.match(/\.(\w+)$/) || [, 'mp3'])[1].toLowerCase();
        const tipo = f.type && f.type.startsWith('audio/') ? f.type : ({ wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg' }[ext] || 'audio/mpeg');
        const r = await upload(`estudio-musica/importadas/${Date.now()}.${ext}`, f, { access: 'public', handleUploadUrl: '/api/musica-audio-upload', contentType: tipo });
        const titulo = f.name.replace(/\.\w+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
        const d = await api('/api/estudio/importar', { method: 'POST', body: JSON.stringify({ titulo, audioUrl: r.url, duracaoSeg, origem }) });
        setMusicas((ms) => [d.musica, ...ms]);
        feitas += 1;
      } catch (e) {
        falhas.push(`${f.name} (${e.message})`);
      }
    }
    setImportando(null);
    setFiltro('todas');
    setAviso(`${feitas} música(s) importada(s).${falhas.length ? ` Não entraram: ${falhas.join('; ')}` : ''} Toque em ⋯ para colocar a letra, o estilo e a capa.`);
  }

  async function salvarLetra() {
    const e = editandoLetra;
    if (!e) return;
    try {
      await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: e.id, letra: e.letra, estilo: e.estilo, instrumental: e.instrumental }) });
      atualizarLocal(e.id, { letra: e.letra, estilo: e.estilo, instrumental: e.instrumental });
      setEditandoLetra(null);
    } catch (err) {
      setAviso(err.message);
    }
  }

  function separarStems(m) {
    comTrabalho(m.id, 'Separando voz e instrumentos…', async (msg) => {
      const job = await api('/api/cover/fal', { method: 'POST', body: JSON.stringify({ tipo: 'separar', audioUrl: m.audioUrl }) });
      const fim = Date.now() + 15 * 60 * 1000;
      let resultado = null;
      while (Date.now() < fim) {
        const q = new URLSearchParams({ statusUrl: job.statusUrl, responseUrl: job.responseUrl });
        const d = await api(`/api/cover/fal?${q.toString()}`);
        if (d.pronto) { resultado = d.resultado; break; }
        msg(d.status === 'IN_QUEUE' ? 'Separando… (na fila)' : 'Separando voz e instrumentos…');
        await sleep(4000);
      }
      if (!resultado) throw new Error('A separação demorou demais. Tente de novo.');
      const stems = {};
      Object.entries(resultado).forEach(([k, v]) => { if (v && typeof v.url === 'string') stems[k] = v.url; });
      if (!Object.keys(stems).length) throw new Error('A separação não devolveu arquivos.');
      await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, stems }) });
      atualizarLocal(m.id, { stems });
      setAberta(m.id);
    });
  }

  function mandarParaFila(m) {
    if (!m.letra || !m.letra.trim()) {
      setAviso('A fila do canal precisa da letra. Essa música não tem letra salva (instrumental ou modo simples).');
      return;
    }
    if (!window.confirm(`Mandar "${m.titulo}" para a Fila de músicas do canal (vira vídeo e publica sozinho)?`)) return;
    comTrabalho(m.id, 'Mandando para a fila…', async () => {
      await api('/api/musica-fila-adicionar', {
        method: 'POST',
        body: JSON.stringify({
          audioUrl: m.audioUrl,
          letra: m.letra,
          titulo: m.titulo,
          formato: 'longo',
          textoThumbnail: (m.titulo || '').toUpperCase().slice(0, 40),
          ambiente: 'production',
        }),
      });
      setAviso(`"${m.titulo}" entrou na Fila de músicas.`);
    });
  }

  const escolha = useMemo(() => escolhidas(musicas), [musicas]);
  const avaliacao = (m) => avaliarStreaming(m, escolha);
  let lista = musicas.filter((m) => {
    if (filtro === 'streaming' && m.tipo === 'medley') return false;
    if (filtro === 'importadas' && !m.importada) return false;
    if (filtro === 'favoritas' && !m.favorito) return false;
    if (filtro === 'elevenlabs' && m.motor !== 'elevenlabs') return false;
    if (filtro === 'lyria' && m.motor !== 'lyria') return false;
    if (filtro === 'medley' && m.tipo !== 'medley') return false;
    if (busca && !`${m.titulo} ${m.estilo} ${m.descricao}`.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });
  if (filtro === 'streaming') lista = [...lista].sort((a, b) => avaliacao(b).nota - avaliacao(a).nota);

  const podeCriar = modo === 'simples' ? descricao.trim() : (instrumental || letra.trim());

  return (
    <>
      <Head><title>Estúdio de Música · Youvideo</title></Head>

      <div className="est">
        <header className="est-top">
          <a href="/" className="est-voltar">← Painel</a>
          <h1>Estúdio de Música</h1>
          <p className="subtitle">Descreva ou escreva sua letra, escolha o estilo e a IA cria a música completa.</p>
        </header>

        {aviso && (
          <div className="est-aviso" onClick={() => setAviso('')}>{aviso} <span>✕</span></div>
        )}

        <div className="est-grid">
          {/* ───────── Coluna de criação ───────── */}
          <section className="est-criar">
            <div className="est-abas">
              <button className={modo === 'simples' ? 'on' : ''} onClick={() => setModo('simples')}>Simples</button>
              <button className={modo === 'personalizado' ? 'on' : ''} onClick={() => setModo('personalizado')}>Personalizado</button>
              <button className={modo === 'medley' ? 'on' : ''} onClick={() => setModo('medley')}>Medley</button>
            </div>

            {modo === 'medley' ? (
              <>
                <label className="est-rot">Título do medley</label>
                <input value={medTitulo} onChange={(e) => setMedTitulo(e.target.value)} placeholder="Ex: 1 HORA DE LOUVOR — Sertanejo, Forró e Pagode Pra Deus" />

                <label className="est-rot">Tema geral</label>
                <textarea rows={3} value={medTema} onChange={(e) => setMedTema(e.target.value)} placeholder="Ex: gratidão a Deus e esperança no dia a dia" />

                <label className="est-rot">Músicas ({medFaixas.length})</label>
                <div className="est-faixas">
                  {medFaixas.map((f, i) => (
                    <div key={i} className="est-faixa">
                      <span className="est-faixa-n">{i + 1}</span>
                      <div className="est-faixa-campos">
                        <select value={f.estiloId} onChange={(e) => setMedFaixas((fs) => fs.map((x, k) => (k === i ? { ...x, estiloId: e.target.value } : x)))}>
                          {ESTILOS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select>
                        <div className="est-faixa-rit">
                          <span>{RITMOS.find((r) => r.id === (f.ritmo || ''))?.nome}</span>
                          <EscolherRitmo compacto valor={f.ritmo || ''} onChange={(v) => setMedFaixas((fs) => fs.map((x, k) => (k === i ? { ...x, ritmo: v } : x)))} />
                        </div>
                        <input value={f.tema} onChange={(e) => setMedFaixas((fs) => fs.map((x, k) => (k === i ? { ...x, tema: e.target.value } : x)))} placeholder="Tema próprio (opcional)" />
                      </div>
                      <button className="est-faixa-x" disabled={medFaixas.length <= 2} onClick={() => setMedFaixas((fs) => fs.filter((_, k) => k !== i))}>✕</button>
                    </div>
                  ))}
                </div>
                {medFaixas.length < 10 && (
                  <button className="est-btn-sec est-add" onClick={() => setMedFaixas((fs) => [...fs, { estiloId: ESTILOS[fs.length % ESTILOS.length].id, tema: '', ritmo: '' }])}>+ Adicionar música</button>
                )}

                <label className="est-rot">Instrumentos e arranjo (vale para todas)</label>
                <PainelIdeias selecionadas={ideias} setSelecionadas={setIdeias} />

                <label className="est-rot">Voz</label>
                <div className="est-chips">
                  {VOZES.map((v) => (
                    <button key={v.id} className={voz === v.id ? 'on' : ''} onClick={() => setVoz(v.id)}>{v.nome}</button>
                  ))}
                </div>

                <label className="est-rot">Duração de cada música: {fmtTempo(duracao)}</label>
                <input type="range" min={60} max={300} step={15} value={duracao} onChange={(e) => setDuracao(+e.target.value)} />

                <label className="est-rot">Transição entre músicas: {crossfade}s</label>
                <input type="range" min={0} max={8} step={1} value={crossfade} onChange={(e) => setCrossfade(+e.target.value)} />

                <label className="est-rot">Motor de IA</label>
                <div className="est-motores">
                  {MOTORES.filter((m) => m.id !== 'comparar').map((m) => (
                    <button key={m.id} className={motor === m.id ? 'on' : ''} onClick={() => setMotor(m.id)}>
                      <strong>{m.nome}</strong>
                      <small>{m.id === 'lyria' ? '~R$0,50-1 por música' : '~R$3-5 por música'}</small>
                    </button>
                  ))}
                </div>

                <button className="est-criar-btn" disabled={!!medProgresso} onClick={criarMedley}>
                  🎶 Criar medley ({medFaixas.length} músicas · ~{fmtTempo(medFaixas.length * duracao)})
                </button>
                <small className="est-nota">A IA escreve cada letra, cria cada música e junta tudo num MP3 só. Leva uns 3 a 8 minutos. Deixe a tela aberta.</small>
              </>
            ) : (<>

            {modo === 'simples' ? (
              <>
                <label className="est-rot">Descreva sua música</label>
                <textarea
                  rows={5}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: um louvor emocionante sobre recomeçar depois de uma perda, com piano e voz masculina forte"
                  maxLength={1000}
                />
              </>
            ) : (
              <>
                <label className="est-rot">Título</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fé Que Levanta" />

                {!instrumental && (
                  <>
                    <label className="est-rot">Letra</label>
                    <div className="est-ia">
                      <input value={temaLetra} onChange={(e) => setTemaLetra(e.target.value)} placeholder="Tema para a IA escrever (ex: Deus nunca desiste de você)" />
                      <button className="est-btn-sec" disabled={escrevendo} onClick={() => escreverLetra(false)}>
                        {escrevendo ? 'Escrevendo…' : '✨ Escrever'}
                      </button>
                    </div>
                    <textarea
                      rows={12}
                      value={letra}
                      onChange={(e) => setLetra(e.target.value)}
                      placeholder={'[Verse]\nSua letra aqui…\n\n[Chorus]\nRefrão…'}
                      maxLength={3500}
                    />
                    <div className="est-linha">
                      <small>{letra.length}/3500 · use [Verse], [Chorus], [Bridge]</small>
                      {letra.trim() && (
                        <button className="est-link" disabled={escrevendo} onClick={() => escreverLetra(true)}>{idioma === 'en' ? '🌎 Passar a letra para inglês / melhorar' : 'Melhorar letra com IA'}</button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            <label className="est-rot">Estilo</label>
            <div className="est-chips">
              {ESTILOS.map((e) => (
                <button key={e.id} className={estiloId === e.id ? 'on' : ''} onClick={() => setEstiloId(e.id)}>{e.nome}</button>
              ))}
            </div>

            <label className="est-rot">Parecido com (opcional)</label>
            <div className="est-ref">
              <input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                onBlur={() => referencia.trim() && analisarReferencia()}
                placeholder="Ex.: Armandinho, Iron Maiden, Legião Urbana…"
              />
              <button className="est-btn-sec" disabled={analisandoRef || !referencia.trim()} onClick={analisarReferencia}>{analisandoRef ? 'Analisando…' : '🔍 Entender'}</button>
            </div>
            {refInfo && refInfo.de === referencia.trim() && (
              <small className="est-ref-ok">🎯 {refInfo.resumo || 'Estilo entendido.'} A música sai original, só com o som parecido.</small>
            )}

            <label className="est-rot">Ritmo</label>
            <EscolherRitmo valor={ritmo} onChange={setRitmo} />

            <PainelIdeias selecionadas={ideias} setSelecionadas={setIdeias} estiloId={estiloId} />
            <input
              style={{ marginTop: 8 }}
              value={estiloExtra}
              onChange={(e) => setEstiloExtra(e.target.value)}
              placeholder="Outros detalhes com suas palavras (opcional)…"
            />

            <label className="est-toggle">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              <span>Instrumental (sem voz)</span>
            </label>

            {!instrumental && (
              <>
                <label className="est-rot">Voz</label>
                <div className="est-chips">
                  {VOZES.map((v) => (
                    <button key={v.id} className={voz === v.id ? 'on' : ''} onClick={() => setVoz(v.id)}>{v.nome}</button>
                  ))}
                </div>
                <label className="est-rot">Idioma da música</label>
                <div className="est-chips">
                  <button className={idioma === 'pt' ? 'on' : ''} onClick={() => setIdioma('pt')}>🇧🇷 Português</button>
                  <button className={idioma === 'en' ? 'on' : ''} onClick={() => setIdioma('en')}>🇺🇸 Inglês</button>
                </div>
                {idioma === 'en' && <small className="est-dica-idioma">A letra e o canto saem em inglês. Se já tem uma letra em português, clique em "Passar a letra para inglês" embaixo dela.</small>}
              </>
            )}

            <label className="est-rot">Duração: {fmtTempo(duracao)}</label>
            <input type="range" min={30} max={300} step={15} value={duracao} onChange={(e) => setDuracao(+e.target.value)} />

            <label className="est-rot">Motor de IA</label>
            <div className="est-motores">
              {MOTORES.map((m) => (
                <button key={m.id} className={motor === m.id ? 'on' : ''} onClick={() => setMotor(m.id)}>
                  <strong>{m.nome}</strong>
                  <small>{m.desc}</small>
                </button>
              ))}
            </div>

            <button className="est-criar-btn" disabled={!podeCriar} onClick={() => criar()}>
              🎵 Criar música
            </button>
            <small className="est-nota">Cada clique gera 2 versões. Leva de 30 s a 2 min.</small>
            </>)}
          </section>

          {/* ───────── Biblioteca ───────── */}
          <section className="est-bib">
            <div className="est-bib-top">
              <h2>Minhas músicas</h2>
              <input className="est-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" />
            </div>
            <div className="est-chips est-filtros">
              {[['todas', 'Todas'], ['favoritas', '★ Favoritas'], ['medley', 'Medleys'], ['elevenlabs', 'ElevenLabs'], ['lyria', 'Lyria'], ['importadas', 'Importadas'], ['streaming', '🎧 Streaming']].map(([id, nome]) => (
                <button key={id} className={filtro === id ? 'on' : ''} onClick={() => setFiltro(id)}>{nome}</button>
              ))}
              <button className={`est-juntar-toggle ${selecionando ? 'on' : ''}`} onClick={() => { setSelecionando(!selecionando); setSelecao([]); }}>
                {selecionando ? 'Cancelar seleção' : '🔗 Juntar músicas'}
              </button>
              <button className={`est-juntar-toggle ${importando ? 'on' : ''}`} onClick={() => setImportando(importando ? null : { origem: 'suno', status: '' })}>
                {importando ? 'Fechar' : '⬆ Importar músicas'}
              </button>
            </div>

            {importando && (
              <div className="est-selbar est-importar">
                <div>
                  <b>Trazer músicas de outra plataforma</b>
                  <small>Baixe as músicas no Suno, no Nuivi ou onde estiverem (MP3 ou WAV) e escolha os arquivos aqui. Pode escolher várias de uma vez.</small>
                </div>
                <select value={importando.origem} disabled={!!importando.status} onChange={(e) => setImportando({ ...importando, origem: e.target.value })}>
                  <option value="suno">Vieram do Suno</option>
                  <option value="nuivi">Vieram do Nuivi</option>
                  <option value="outra">Outra origem</option>
                </select>
                {importando.status ? (
                  <span><span className="est-spin" /> {importando.status}</span>
                ) : (
                  <label className="est-btn-sec est-escolher">
                    📂 Escolher arquivos
                    <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" multiple hidden onChange={(e) => { importarArquivos(e.target.files); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            )}

            {!selecionando && (
              <div className={`est-selbar est-lote ${marcadas.length ? "cheia" : ""}`}>
                {marcadas.length ? (
                  <>
                    <span>{loteRodando || `${marcadas.length} marcada${marcadas.length > 1 ? 's' : ''}`}</span>
                    <select value={versoesLote} onChange={(e) => setVersoesLote(Number(e.target.value))}>
                      <option value={1}>1 versão de cada</option>
                      <option value={2}>2 versões de cada</option>
                    </select>
                    <select value={motorLote} onChange={(e) => setMotorLote(e.target.value)} title="Motor da nova versão">
                      <option value="elevenlabs">com ElevenLabs</option>
                      <option value="lyria">com Google Lyria</option>
                      <option value="">com o mesmo motor</option>
                    </select>
                    <button className="est-btn-sec" onClick={novaVersaoMarcadas}>🔁 Nova versão</button>
                    <button className="est-btn-sec" disabled={!!loteRodando} onClick={() => prepararStreaming(musicas.filter((x) => marcadas.includes(x.id) && x.tipo !== 'medley'))} title="Um pacote só, com uma pasta por música: áudio, capa com o título, letra e ficha">📦 Preparar para streaming{marcadas.length > 1 ? ` (${marcadas.length})` : ''}</button>
                    <button className="est-btn-sec" disabled={!!loteRodando} onClick={baixarMarcadas}>⬇ Baixar {marcadas.length > 1 ? `(${marcadas.length})` : ''}</button>
                    <button className="est-btn-sec perigo" disabled={!!loteRodando} onClick={excluirMarcadas}>🗑 Excluir</button>
                    <button className="est-btn-link" onClick={() => setMarcadas([])}>Desmarcar</button>
                  </>
                ) : (
                  <>
                    <span>{loteRodando || 'Marque ☐ as músicas para preparar para streaming, baixar ou fazer nova versão de várias de uma vez'}</span>
                    <button className="est-btn-link" onClick={() => setMarcadas(lista.map((m) => m.id))}>Marcar todas</button>
                  </>
                )}
              </div>
            )}

            {selecionando && (
              <div className="est-selbar">
                <span>{selecao.length ? `${selecao.length} selecionadas, na ordem em que você clicou` : 'Clique nas músicas na ordem em que devem tocar'}</span>
                <button className="est-btn-sec" disabled={selecao.length < 2 || !!medProgresso} onClick={juntarSelecionadas}>Juntar em medley</button>
              </div>
            )}

            {medProgresso && (
              <div className={`est-card est-medprog ${medProgresso.erro ? 'erro' : ''}`}>
                <div className="est-medprog-top">
                  {medProgresso.erro ? '⚠️' : <span className="est-spin" />}
                  <strong>{medProgresso.titulo}</strong>
                </div>
                <div className="est-medprog-lista">
                  {medProgresso.etapas.map((e) => (
                    <div key={e.nome}><span>{e.nome}</span><span>{e.status}</span></div>
                  ))}
                  <div><span>Juntar tudo numa faixa</span><span>{medProgresso.fase === 'juntando' ? (medProgresso.erro ? '—' : 'juntando…') : 'esperando'}</span></div>
                </div>
                {medProgresso.erro && (
                  <div className="est-erro-txt">
                    {medProgresso.erro}
                    {medProgresso.plano && (
                      <div className="est-medprog-btns">
                        {medProgresso.falhas?.length > 0 && (
                          <button className="est-btn-sec" onClick={tentarFalhasDeNovo}>🔁 Tentar de novo as que falharam</button>
                        )}
                        {medProgresso.plano.prontas.filter(Boolean).length >= 2 && (
                          <button className="est-btn-sec" onClick={() => juntarPlano(medProgresso.plano)}>
                            🔗 Juntar as {medProgresso.plano.prontas.filter(Boolean).length} prontas
                          </button>
                        )}
                      </div>
                    )}
                    <button className="est-link" onClick={() => setMedProgresso(null)}>fechar</button>
                  </div>
                )}
              </div>
            )}

            {gerando.map((g) => (
              <div key={g.chave} className={`est-card est-gerando ${g.erro ? 'erro' : ''}`}>
                <div className="est-capa est-capa-vazia">{g.erro ? '⚠️' : <span className="est-spin" />}</div>
                <div className="est-info">
                  <div className="est-titulo">{g.titulo ? g.titulo.slice(0, 60) : 'Nova música'}</div>
                  {g.erro ? (
                    <div className="est-erro-txt">
                      {g.erro}
                      <button className="est-link" onClick={() => setGerando((x) => x.filter((y) => y.chave !== g.chave))}>fechar</button>
                    </div>
                  ) : (
                    <div className="est-meta">Criando com {nomeMotor(g.motor)}… {fmtTempo((agora - g.inicio) / 1000)}</div>
                  )}
                </div>
              </div>
            ))}

            {carregando && <p className="est-vazio">Carregando…</p>}
            {!carregando && !lista.length && !gerando.length && (
              <p className="est-vazio">Nenhuma música ainda. Crie a primeira ao lado 👈</p>
            )}

            {lista.map((m) => {
              const ativa = tocando?.id === m.id;
              const ocupado = trabalho[m.id];
              return (
                <div key={m.id} className={`est-card ${ativa ? 'ativa' : ''} ${selecionando ? 'sel' : ''} ${selecao.includes(m.id) ? 'marcada' : ''}`} onClick={selecionando ? () => alternarSelecao(m.id) : undefined}>
                  {selecionando && <span className="est-selnum">{selecao.includes(m.id) ? selecao.indexOf(m.id) + 1 : ''}</span>}
                  <button className="est-capa" onClick={(e) => { if (selecionando) return; e.stopPropagation(); tocar(m); }} style={m.capaUrl ? { backgroundImage: `url(${m.capaUrl})` } : undefined}>
                    <span className="est-play">{ativa && !pausado ? '❚❚' : '▶'}</span>
                  </button>
                  <div className="est-info">
                    <div className="est-titulo" onClick={() => setAberta(aberta === m.id ? null : m.id)}>
                      {!selecionando && (
                        <input
                          type="checkbox"
                          className="est-marca"
                          title="Marcar para nova versão"
                          checked={marcadas.includes(m.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => setMarcadas((xs) => (xs.includes(m.id) ? xs.filter((x) => x !== m.id) : [...xs, m.id]))}
                        />
                      )}
                      {m.titulo}
                      {m.versao ? <span className="est-v">v{m.versao}</span> : null}
                    </div>
                    <div className="est-meta">
                      <span className={`est-badge ${m.motor}`}>{nomeMotor(m.motor)}</span>
                      {m.tipo === 'medley' ? ` ${(m.faixas || []).length} músicas · ` : m.instrumental ? ' Instrumental · ' : ' '}
                      {fmtTempo(m.duracaoSeg)} · {new Date(m.criadoEm).toLocaleDateString('pt-BR')}
                      {filtro === 'streaming' && (() => {
                        const av = avaliacao(m);
                        return <span className={`est-stream ${av.pronta ? 'ok' : ''}`} title={av.itens.filter((x) => !x.ok).map((x) => x.texto).join('\n')}>{av.pronta ? `🎧 Pronta ${av.nota}` : `🎧 Ajustar ${av.nota}`}</span>;
                      })()}
                    </div>
                    {ocupado && <div className="est-ocupado"><span className="est-spin" /> {ocupado}</div>}
                  </div>
                  <div className="est-acoes" style={selecionando ? { display: 'none' } : undefined}>
                    <button title="Favoritar" className={m.favorito ? 'fav' : ''} onClick={() => favoritar(m)}>{m.favorito ? '★' : '☆'}</button>
                    <button title="Baixar MP3" onClick={() => baixar(m.audioUrl, arquivoNome(m.titulo))}>⬇</button>
                    <button title="Mais opções" onClick={() => setAberta(aberta === m.id ? null : m.id)}>⋯</button>
                  </div>

                  {aberta === m.id && !selecionando && (
                    <div className="est-mais">
                      {m.tipo === 'medley' && (
                        <EstilosDoMedley medley={m} biblioteca={musicas} />
                      )}
                      {m.tipo !== 'medley' && (
                        <div className="est-check">
                          <b>🎧 Para Spotify e outras plataformas ({avaliacao(m).nota}/100)</b>
                          {avaliacao(m).itens.map((x, k) => <div key={k} className={x.ok ? 'ok' : 'nao'}>{x.ok ? '✓' : '⚠'} {x.texto}</div>)}
                        </div>
                      )}
                      {editandoLetra?.id === m.id && (
                        <div className="est-editar-letra">
                          <label>Estilo / gênero (ex.: reggae, rock, sertanejo)</label>
                          <input value={editandoLetra.estilo} onChange={(e) => setEditandoLetra({ ...editandoLetra, estilo: e.target.value })} placeholder="reggae" />
                          <label className="est-toggle"><input type="checkbox" checked={editandoLetra.instrumental} onChange={(e) => setEditandoLetra({ ...editandoLetra, instrumental: e.target.checked })} /><span>Instrumental (sem voz)</span></label>
                          {!editandoLetra.instrumental && (
                            <>
                              <label>Letra (cole aqui a letra que você usou)</label>
                              <textarea rows={8} value={editandoLetra.letra} onChange={(e) => setEditandoLetra({ ...editandoLetra, letra: e.target.value })} placeholder="Cole a letra da música…" />
                            </>
                          )}
                          <div className="est-linha">
                            <button className="est-btn-sec" onClick={salvarLetra}>Salvar</button>
                            <button className="est-btn-link" onClick={() => setEditandoLetra(null)}>Cancelar</button>
                          </div>
                        </div>
                      )}
                      <div className="est-mais-btns">
                        {m.tipo !== 'medley' && <button disabled={!!ocupado || !!loteRodando} onClick={() => prepararStreaming([m])}>{preparando.includes(m.id) ? `⏳ ${loteRodando}` : '📦 Preparar para Spotify'}</button>}
                        {m.tipo === 'medley' ? (
                          <button disabled={!!ocupado} onClick={() => mandarParaMedleyCanal(m)}>📺 Mandar p/ Medley do canal</button>
                        ) : (
                          <>
                            {!m.importada && <button disabled={!!ocupado} onClick={() => variacao(m)}>🔁 Nova versão</button>}
                            {/* Aumentar vale também para as importadas (Nuivi, Suno...): o áudio é enviado como está */}
                            <button disabled={!!ocupado} onClick={() => aumentar(m)}>⏩ Aumentar música</button>
                            {!m.importada && <button onClick={() => reutilizar(m)}>✏️ Editar e recriar</button>}
                            {!m.instrumental && m.idioma !== 'en' && <button disabled={!!ocupado} onClick={() => versaoEmIngles(m)}>🌎 Versão em inglês</button>}
                          </>
                        )}
                        {m.tipo !== 'medley' && <button onClick={() => setEditandoLetra({ id: m.id, letra: m.letra || '', estilo: m.estilo || '', instrumental: !!m.instrumental })}>📝 Letra e estilo</button>}
                        <button disabled={!!ocupado} onClick={() => gerarCapa(m)}>🎨 {m.capaUrl ? 'Nova capa' : 'Gerar capa'}</button>
                        {m.capaUrl && (m.capaArteUrl
                          ? <button disabled={!!ocupado} onClick={() => tirarTituloDaCapa(m)}>🔤 Tirar o título da capa</button>
                          : <button disabled={!!ocupado} onClick={() => tituloNaCapa(m)}>🔤 Pôr o título na capa</button>)}
                        <label className={`est-enviar-capa ${ocupado ? 'off' : ''}`}>
                          🖼 Enviar minha capa
                          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!!ocupado} onChange={(e) => { enviarCapa(m, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                        <button disabled={!!ocupado} onClick={() => separarStems(m)}>🎚 Separar voz/instrumental</button>
                        {m.tipo !== 'medley' && <button disabled={!!ocupado} onClick={() => mandarParaFila(m)}>📺 Mandar p/ fila do canal</button>}
                        <a className="est-mais-a" href="/cover">🎤 Fazer cover com voz IA</a>
                        <button onClick={() => renomear(m)}>✎ Renomear</button>
                        <button className="perigo" onClick={() => excluir(m)}>🗑 Excluir</button>
                      </div>

                      {m.stems && Object.keys(m.stems).length > 0 && (
                        <div className="est-stems">
                          <strong>Faixas separadas:</strong>
                          {Object.entries(m.stems).map(([k, url]) => (
                            <div key={k} className="est-stem">
                              <span>{({ vocals: 'Voz', drums: 'Bateria', bass: 'Baixo', other: 'Outros', guitar: 'Guitarra', piano: 'Piano' })[k] || k}</span>
                              <audio controls preload="none" src={url} />
                              <button className="est-link" onClick={() => baixar(url, arquivoNome(`${m.titulo}-${k}`))}>baixar</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {m.capaUrl && (
                        <button className="est-link" onClick={() => baixar(m.capaUrl, arquivoNome(m.titulo, 'jpg'))}>Baixar capa</button>
                      )}

                      {m.tipo === 'medley' && (m.faixas || []).length > 0 && (
                        <div className="est-stems">
                          <strong>Músicas do medley:</strong>
                          {m.faixas.map((f, i) => (
                            <div key={i} className="est-stem">
                              <span>{i + 1}. {f.titulo}</span>
                              <audio controls preload="none" src={f.audioUrl} />
                              <button className="est-link" onClick={() => baixar(f.audioUrl, arquivoNome(f.titulo))}>baixar</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="est-detalhe">
                        {m.estilo && m.tipo !== 'medley' && (() => {
                          const d = descreverEstilo(m.estilo);
                          return (
                            <>
                              {d.estilo && <p><strong>Estilo:</strong> {d.estilo}</p>}
                              {d.ritmo && <p><strong>Ritmo:</strong> {d.ritmo}</p>}
                              {d.ideias.length > 0 && <p><strong>Instrumentos e arranjo:</strong> {d.ideias.join(', ')}</p>}
                              {d.extra && <p><strong>Outros detalhes:</strong> {d.extra}</p>}
                            </>
                          );
                        })()}
                        {m.descricao && <p><strong>Descrição:</strong> {m.descricao}</p>}
                        {m.letra && <pre>{m.letra}</pre>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </div>

      {/* ───────── Player fixo ───────── */}
      <audio
        ref={audioRef}
        playsInline
        preload="none"
        onError={() => tocando && setAviso(`Não deu para carregar "${tocando.titulo}" no player. Toque em "Abrir áudio" para ouvir direto.`)}
        onPlay={() => setPausado(false)}
        onPause={() => setPausado(true)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPausado(true)}
      />
      {tocando && (
        <div className="est-player">
          <div className="est-player-capa" style={tocando.capaUrl ? { backgroundImage: `url(${tocando.capaUrl})` } : undefined} />
          <button className="est-player-play" onClick={() => tocar(tocando)}>{pausado ? '▶' : '❚❚'}</button>
          <div className="est-player-meio">
            <div className="est-player-titulo">{tocando.titulo}</div>
            <div className="est-player-barra">
              <span>{fmtTempo(pos)}</span>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.1}
                value={pos}
                onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = +e.target.value; }}
              />
              <span>{fmtTempo(dur)}</span>
            </div>
          </div>
          <div className="est-vol">
            <button className="est-vol-btn" title="Diminuir volume" onClick={() => mudarVolume(Math.max(0, Math.round((volume - 0.1) * 10) / 10))}>−</button>
            <button className="est-vol-btn" title={mudo ? 'Tirar do mudo' : 'Mudo'} onClick={() => setMudo(!mudo)}>
              {mudo || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={mudo ? 0 : volume}
              onChange={(e) => mudarVolume(+e.target.value)}
              aria-label="Volume"
            />
            <button className="est-vol-btn" title="Aumentar volume" onClick={() => mudarVolume(Math.min(1, Math.round((volume + 0.1) * 10) / 10))}>+</button>
            <span className="est-vol-num">{mudo ? 0 : Math.round(volume * 100)}%</span>
          </div>
          <a className="est-player-abrir" href={tocando.audioUrl} target="_blank" rel="noreferrer">Abrir áudio</a>
          <button className="est-player-x" onClick={() => { audioRef.current?.pause(); setTocando(null); }}>✕</button>
        </div>
      )}

      {pergunta && (
        <div className="est-perg-fundo" onClick={() => responderPergunta(false)}>
          <form className="est-perg" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); responderPergunta(true); }}>
            <b>{pergunta.titulo}</b>
            {pergunta.nota && <p className="est-perg-nota">{pergunta.nota}</p>}
            {pergunta.campos.map((c, k) => (
              c.opcoes ? (
                <div key={c.chave} className="est-perg-campo">
                  {c.rotulo}
                  <div className="est-perg-opcoes">
                    {c.opcoes.map((o) => (
                      <button type="button" key={o.valor} className={c.valor === o.valor ? 'on' : ''} onClick={() => setPergunta((p) => p && { ...p, campos: p.campos.map((x) => (x.chave === c.chave ? { ...x, valor: o.valor } : x)) })}>{o.rotulo}</button>
                    ))}
                  </div>
                </div>
              ) : (
              <label key={c.chave}>
                {c.rotulo}
                <input
                  type="text"
                  autoFocus={k === 0}
                  value={c.valor}
                  onChange={(e) => { const v = e.target.value; setPergunta((p) => p && { ...p, campos: p.campos.map((x) => (x.chave === c.chave ? { ...x, valor: v } : x)) }); }}
                  onKeyDown={(e) => { if (e.key === 'Escape') responderPergunta(false); }}
                />
              </label>
              )
            ))}
            <div className="est-perg-btns">
              <button type="button" className="est-perg-nao" onClick={() => responderPergunta(false)}>Cancelar</button>
              <button type="submit" className="est-perg-sim">{pergunta.botao}</button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        .est-perg-fundo { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 100; }
        .est-perg { width: 100%; max-width: 460px; background: var(--bg-elevated); border: 1px solid var(--gold); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
        .est-perg b { font-size: 17px; }
        .est-perg-nota { margin: 0; font-size: 13px; color: #e8c46a; }
        .est-dica-idioma { display: block; color: var(--text-muted); margin: -2px 0 8px; font-size: 12px; }
        .est-perg-campo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-muted); }
        .est-perg-opcoes { display: flex; gap: 8px; flex-wrap: wrap; }
        .est-perg-opcoes button { flex: 1; min-width: 90px; text-align: center; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 12px 10px; font-size: 15px; cursor: pointer; }
        .est-perg-opcoes button.on { background: var(--gold-soft); border-color: var(--gold); color: var(--gold); font-weight: 700; }
        .est-perg label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-muted); }
        .est-perg input { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px; font: inherit; font-size: 16px; }
        .est-perg-btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
        .est-perg-btns button { border-radius: 10px; padding: 11px 16px; font-size: 15px; cursor: pointer; }
        .est-perg-nao { background: var(--bg); border: 1px solid var(--border); color: var(--text); }
        .est-perg-sim { background: var(--gold); border: 1px solid var(--gold); color: #1a1408; font-weight: 700; }
        .est { max-width: 1180px; margin: 0 auto; padding: 32px 20px 140px; }
        .est-top h1 { margin: 8px 0 4px; }
        .est-voltar { color: var(--text-muted); text-decoration: none; font-size: 14px; }
        .est-aviso { background: var(--gold-soft); border: 1px solid var(--gold); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; cursor: pointer; display: flex; justify-content: space-between; gap: 12px; }
        .est-grid { display: grid; grid-template-columns: 400px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 900px) { .est-grid { grid-template-columns: 1fr; } }
        .est-grid { padding-bottom: 170px; }
        .est-grid > * { min-width: 0; } /* o player fixo não cobre a última música */

        .est-criar { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 18px; position: sticky; top: 16px; }
        @media (max-width: 900px) { .est-criar { position: static; } }
        .est-abas { display: grid; grid-template-columns: 1fr 1fr 1fr; background: var(--bg); border-radius: 10px; padding: 4px; margin-bottom: 8px; }
        .est-abas button { background: none; border: 0; color: var(--text-muted); padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; }
        .est-abas button.on { background: var(--gold); color: #1a1407; }
        .est-rot { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
        .est textarea, .est input:not([type]), .est input[type='text'] { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px; font: inherit; font-size: 15px; resize: vertical; }
        .est textarea:focus, .est input:focus { outline: none; border-color: var(--gold); }
        .est input[type='range'] { width: 100%; accent-color: var(--gold); }
        .est-ia { display: flex; gap: 8px; margin-bottom: 8px; }
        .est-linha { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; color: var(--text-muted); gap: 8px; }
        .est-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .est-chips button { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
        .est-chips button.on { border-color: var(--gold); background: var(--gold-soft); color: var(--gold); }
        .est-toggle { display: flex; align-items: center; gap: 10px; margin-top: 16px; cursor: pointer; font-weight: 500; }
        .est-toggle input { width: 18px; height: 18px; accent-color: var(--gold); }
        .est-motores { display: grid; gap: 6px; }
        .est-motores button { text-align: left; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
        .est-motores button.on { border-color: var(--gold); background: var(--gold-soft); }
        .est-motores small { color: var(--text-muted); }
        .est-criar-btn { width: 100%; margin-top: 20px; padding: 16px; font-size: 18px; font-weight: 700; border: 0; border-radius: 12px; background: linear-gradient(135deg, #e7b453, #b1432f); color: #fff; cursor: pointer; }
        .est-criar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .est-nota { display: block; text-align: center; color: var(--text-muted); margin-top: 8px; }
        .est-btn-sec { white-space: nowrap; background: var(--gold-soft); border: 1px solid var(--gold); color: var(--gold); border-radius: 10px; padding: 0 14px; font-weight: 600; cursor: pointer; }
        .est-link { background: none; border: 0; color: var(--gold); cursor: pointer; font-size: 13px; padding: 4px 0; text-decoration: underline; }

        .est-bib-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .est-bib-top h2 { font-family: 'Fraunces', Georgia, serif; margin: 0; }
        .est-busca { max-width: 220px; }
        .est-filtros { margin: 12px 0 14px; }
        .est-vazio { color: var(--text-muted); text-align: center; padding: 40px 0; }

        .est-card { display: grid; grid-template-columns: 64px 1fr auto; gap: 14px; align-items: center; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 10px; margin-bottom: 8px; }
        .est-card.ativa { border-color: var(--gold); }
        .est-card.erro { border-color: var(--terracotta); }
        .est-capa { width: 64px; height: 64px; border-radius: 8px; border: 0; cursor: pointer; background: linear-gradient(135deg, #3a2e1a, #1c1811); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; position: relative; }
        .est-capa-vazia { cursor: default; }
        .est-play { background: rgba(0,0,0,0.55); color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .est-info { min-width: 0; }
        .est-titulo { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .est-v { font-size: 11px; color: var(--text-muted); margin-left: 6px; font-weight: 500; }
        .est-meta { color: var(--text-muted); font-size: 13px; margin-top: 3px; }
        .est-badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--teal-soft); color: #8fc4b6; }
        .est-badge.lyria { background: var(--terracotta-soft); color: #e38b77; }
        .est-erro-txt { color: #e38b77; font-size: 13px; }
        .est-ocupado { color: var(--gold); font-size: 13px; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
        .est-acoes { display: flex; gap: 4px; }
        .est-acoes button { width: 38px; height: 38px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); color: var(--text); cursor: pointer; font-size: 16px; }
        .est-acoes button.fav { color: var(--gold); border-color: var(--gold); }

        .est-mais { grid-column: 1 / -1; border-top: 1px solid var(--border); padding-top: 12px; }
        .est-mais-btns { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; }
        .est-mais-btns button, .est-mais-a, .est-enviar-capa { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 11px 12px; text-align: left; cursor: pointer; font-size: 14px; text-decoration: none; }
        .est-mais-btns button:disabled { opacity: 0.4; }
        .est-enviar-capa.off { opacity: 0.4; pointer-events: none; }
        .est-mais-btns .perigo { color: #e38b77; }
        .est-stems { margin-top: 12px; display: grid; gap: 6px; }
        .est-stem { display: grid; grid-template-columns: 80px 1fr auto; gap: 8px; align-items: center; font-size: 14px; }
        .est-stem audio { width: 100%; height: 34px; }
        .est-detalhe { margin-top: 10px; font-size: 14px; color: var(--text-muted); }
        .est-detalhe pre { white-space: pre-wrap; font-family: inherit; background: var(--bg); border-radius: 8px; padding: 12px; color: var(--text); max-height: 320px; overflow: auto; }

        .est select { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 10px; font: inherit; }
        .est-faixas { display: grid; gap: 8px; }
        .est-faixa { display: grid; grid-template-columns: 26px 1fr 30px; gap: 8px; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
        .est-faixa-n { width: 26px; height: 26px; border-radius: 50%; background: var(--gold-soft); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
        .est-faixa-campos { display: grid; gap: 6px; }
        .est-faixa-campos select, .est-faixa-campos input { background: var(--bg-elevated) !important; padding: 8px 10px !important; font-size: 14px !important; }
        .est-faixa-rit { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .est-faixa-rit > span { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
        .est-faixa-x { background: none; border: 0; color: var(--text-muted); cursor: pointer; font-size: 15px; }
        .est-faixa-x:disabled { opacity: 0.3; }
        .est-add { width: 100%; padding: 10px; margin-top: 8px; }
        .est-juntar-toggle { margin-left: auto; border-style: dashed !important; }
        .est-selbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--gold-soft); border: 1px solid var(--gold); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; font-size: 14px; }
        .est-selbar .est-btn-sec { padding: 9px 14px; }
        .est-card.sel { cursor: pointer; grid-template-columns: 28px 64px 1fr; }
        .est-card.marcada { border-color: var(--gold); background: var(--gold-soft); }
        .est-selnum { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--gold); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
        .est-medprog { display: block; }
        .est-medprog-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .est-medprog-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 4px; }
        .est-medprog-btns .est-btn-sec { padding: 9px 14px; }
        .est-medprog-lista { display: grid; gap: 4px; font-size: 14px; }
        .est-medprog-lista div { display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted); }
        .est-badge.medley { background: var(--gold-soft); color: var(--gold); }
        .est-spin { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--gold); border-radius: 50%; display: inline-block; animation: gira 0.8s linear infinite; }
        .est-gerando .est-spin { width: 26px; height: 26px; }
        @keyframes gira { to { transform: rotate(360deg); } }

        .est-player { position: fixed; left: 0; right: 0; bottom: 0; background: #0f0d0a; border-top: 1px solid var(--border); padding: 10px 16px; display: flex; align-items: center; gap: 12px; z-index: 50; }
        .est-player-capa { width: 48px; height: 48px; border-radius: 6px; background: linear-gradient(135deg, #3a2e1a, #1c1811); background-size: cover; background-position: center; flex-shrink: 0; }
        .est-player-play { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--gold); color: #1a1407; font-size: 14px; cursor: pointer; flex-shrink: 0; }
        .est-player-meio { flex: 1; min-width: 0; }
        .est-player-titulo { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .est-player-barra { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
        .est-vol { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .est-vol input[type='range'] { width: 110px; }
        .est-vol-btn { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-elevated); color: var(--text); font-size: 16px; cursor: pointer; }
        .est-vol-num { font-size: 12px; color: var(--text-muted); width: 36px; text-align: right; }
        @media (max-width: 640px) {
          .est-player { flex-wrap: wrap; }
          .est-vol { width: 100%; justify-content: center; order: 5; }
          .est-vol input[type='range'] { flex: 1; width: auto; }
        }
        .est-lote { flex-wrap: wrap; gap: 8px; }
        .est-lote:not(.cheia) { background: transparent; border-style: dashed; border-color: var(--border); color: var(--text-muted); }
        .est-lote select { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; }
        .est-lote .perigo { color: #e38b77; border-color: #e38b77; }
        .est-ref { display: flex; gap: 8px; }
        .est-ref input { flex: 1; min-width: 0; }
        .est-ref-ok { display: block; margin-top: 6px; color: var(--gold); font-size: 13px; line-height: 1.4; }
        .est-stream { margin-left: 6px; font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #3a2f12; color: #e8c46a; }
        .est-stream.ok { background: #123d2c; color: #8fd6c1; }
        .est-check { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; font-size: 13px; line-height: 1.6; }
        .est-check b { display: block; margin-bottom: 4px; }
        .est-check .ok { color: #8fd6c1; }
        .est-check .nao { color: #e8c46a; }
        .est-importar { flex-wrap: wrap; align-items: center; }
        .est-importar > div { flex: 1 1 220px; }
        .est-importar small { display: block; color: var(--text-muted); margin-top: 2px; line-height: 1.4; }
        .est-importar select { background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
        .est-escolher { cursor: pointer; display: inline-block; }
        .est-editar-letra { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
        .est-editar-letra label { font-size: 12px; color: var(--text-muted); }
        .est-editar-letra textarea, .est-editar-letra input[type='text'], .est-editar-letra input:not([type]) { width: 100%; }
        .est-badge.suno, .est-badge.nuivi, .est-badge.outra { background: #1d2b3a; color: #8fc1e8; }
        .est-btn-link { background: none; border: 0; color: var(--gold); text-decoration: underline; cursor: pointer; font-size: 13px; }
        .est-marca { width: 20px; height: 20px; margin-right: 8px; vertical-align: middle; accent-color: var(--gold); cursor: pointer; }
        .est-player-abrir { font-size: 12px; color: var(--gold); white-space: nowrap; text-decoration: underline; }
        @media (max-width: 640px) { .est-player-abrir { order: 4; } }
        .est-player-x { background: none; border: 0; color: var(--text-muted); font-size: 18px; cursor: pointer; }
      `}</style>
    </>
  );
}
