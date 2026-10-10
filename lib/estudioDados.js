// Dados do Estúdio de Música usados pela tela e pela Fábrica de Música (estilos, instrumentos, ritmos, vozes e álbuns prontos).

export const ESTILOS = [
  { id: 'gospel', nome: 'Gospel / Louvor', base: 'Brazilian gospel worship, modern, emotional, piano and pads, uplifting build' },
  { id: 'gospel-animado', nome: 'Gospel Animado', base: 'upbeat Brazilian gospel, festive, drums, bass, joyful, danceable' },
  { id: 'sertanejo-gospel', nome: 'Sertanejo Gospel', base: 'Brazilian sertanejo gospel (louvor sertanejo), acoustic guitar and viola caipira, soft accordion, heartfelt worship, calm and emotional' },
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

export const IDEIAS = [
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

export const TODAS_IDEIAS = IDEIAS.flatMap((c) => c.itens);

// Ritmo / energia da música
export const RITMOS = [
  { id: '', nome: 'Automático', emoji: '🎲', en: '' },
  { id: 'lenta', nome: 'Lenta', emoji: '🐢', en: 'slow tempo around 70 bpm, calm and gentle', alt: ['slow tempo around 70 bpm'] },
  { id: 'media', nome: 'Média', emoji: '🚶', en: 'mid tempo around 95 bpm, steady groove', alt: ['mid tempo around 95 bpm'] },
  { id: 'animada', nome: 'Animada', emoji: '🏃', en: 'upbeat tempo around 120 bpm, energetic', alt: ['upbeat tempo around 125 bpm'] },
  { id: 'muito', nome: 'Muito animada', emoji: '🔥', en: 'very fast high-energy tempo around 140 bpm, danceable' },
];

export function ritmoEn(id) {
  return RITMOS.find((r) => r.id === id)?.en || '';
}

export function ideiasEmTexto(ids) {
  return ids.map((id) => TODAS_IDEIAS.find((x) => x.id === id)?.en).filter(Boolean).join(', ');
}

export const VOZES = [
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

// Álbum: todos os estilos, cada um com instrumentos, ritmo e tema já programados (o dono só escolhe quantas músicas)
export const P_ = (id, nome, estiloId, ideias, ritmo, tema, extra = '', gospel = false) => ({ id, nome, estiloId, ideias, ritmo, tema, extra, gospel, grupo: gospel ? 'Gospel' : 'Outros estilos' });
export const ALBUM_PRESETS = [
  P_('louvor', 'Louvor / Adoração', 'gospel', ['piano', 'pads', 'dedilhado', 'violino', 'cello', 'bat-suave', 'backing', 'build'], 'lenta', 'adoração, gratidão e confiança em Deus', '', true),
  P_('sertanejo-gospel', 'Sertanejo Gospel', 'sertanejo-gospel', ['viola', 'dedilhado', 'acordeon', 'violao-nylon', 'violino', 'bat-suave', 'baixo-groove', 'backing'], 'media', 'fé, oração e gratidão a Deus no dia a dia', '', true),
  P_('gospel-animado', 'Gospel Animado', 'gospel-animado', ['palmas', 'bat-forte', 'baixo-groove', 'hammond', 'naipe', 'guit-limpa', 'backing'], 'animada', 'alegria, vitória e celebração em Deus', '', true),
  P_('pagode-gospel', 'Pagode Gospel', 'pagode', ['cavaco', 'pandeiro', 'banjo', 'tantan', 'surdo', 'violao7', 'roda', 'backing'], 'media', 'louvor e gratidão a Deus com alegria', 'gospel praise lyrics about God', true),
  P_('blues-gospel', 'Blues Gospel', 'blues', ['hammond', 'solo-blues', 'piano', 'baixo-groove', 'bat-suave', 'backing'], 'media', 'fé, esperança e a presença de Deus nas lutas', '', true),
  P_('sertanejo', 'Sertanejo', 'sertanejo', ['viola', 'acordeon', 'dedilhado', 'violao-nylon', 'violino', 'bat-suave', 'baixo-groove'], 'media', 'amor, saudade e histórias da vida no interior'),
  P_('sertanejo-potente', 'Sertanejo Arena', 'sertanejo-potente', ['viola', 'dedilhado', 'acordeon', 'guit-limpa', 'bat-forte', 'baixo-groove', 'build', 'backing'], 'animada', 'amor, festa e saudade'),
  P_('gaucha', 'Gaúcha / Nativista', 'gaucha', ['gaita-gaucha', 'gaita-ponto', 'violao-milonga', 'bombo', 'contrabaixo-acust'], 'media', 'a vida no campo, o Rio Grande e as tradições gaúchas'),
  P_('pagode', 'Pagode / Samba', 'pagode', ['cavaco', 'pandeiro', 'banjo', 'tantan', 'surdo', 'cuica', 'violao7', 'roda'], 'media', 'amor, amizade e os bons momentos com a galera'),
  P_('forro', 'Forró / Piseiro', 'forro', ['sanfona-forro', 'zabumba', 'triangulo', 'pifano', 'rabeca', 'piseiro-teclado'], 'animada', 'festa, amor e saudade do Nordeste'),
  P_('mpb', 'MPB / Acústico', 'mpb', ['violao-nylon', 'dedilhado', 'piano', 'flauta', 'contrabaixo-acust', 'bat-suave', 'acustico'], 'lenta', 'amor, saudade e reflexões sobre a vida'),
  P_('pop', 'Pop', 'pop', ['synth-lead', 'beat', 'piano', 'guit-limpa', 'baixo-groove', 'backing'], 'animada', 'amor, liberdade e boas vibrações'),
  P_('rock', 'Rock', 'rock', ['power-chords', 'riff', 'solo-rock', 'bat-forte', 'baixo-groove', 'hammond'], 'animada', 'liberdade, estrada e superação'),
  P_('metal', 'Heavy Metal', 'metal', ['power-chords', 'palm-mute', 'guitarras-gemeas', 'bumbo-duplo', 'baixo-pesado', 'galope'], 'muito', 'força, coragem e superação'),
  P_('reggae', 'Reggae', 'reggae', ['skank', 'baixo-reggae', 'one-drop', 'orgao-bubble', 'metais-reggae', 'melodica', 'dub'], 'media', 'paz, amor e boas vibrações'),
  P_('funk', 'Funk BR', 'funk', ['beat', 'palmas', 'synth-lead', 'baixo-groove'], 'animada', 'festa, dança e alegria (letra para toda a família)'),
  P_('blues-raiz', 'Blues', 'blues-raiz', ['solo-blues', 'slide', 'gaita', 'hammond', 'baixo-groove', 'bat-suave'], 'lenta', 'a estrada, a saudade e a vida'),
  P_('soul', 'Soul', 'soul', ['naipe', 'rhodes', 'hammond', 'guit-limpa', 'baixo-groove', 'bat-suave', 'backing'], 'media', 'amor, alegria e recomeço'),
  P_('rnb', 'R&B', 'rnb', ['rhodes', 'pads', 'beat', 'baixo-groove', 'backing', 'falsete'], 'lenta', 'amor e romance'),
  P_('jazz', 'Jazz', 'jazz', ['sax', 'trompete', 'piano', 'contrabaixo-acust', 'bat-suave', 'guit-limpa'], 'lenta', 'noites na cidade e romance'),
  P_('bossa', 'Bossa Nova', 'bossa', ['violao-nylon', 'flauta', 'piano', 'contrabaixo-acust', 'bat-suave', 'intima'], 'lenta', 'o mar, o amor e a vida tranquila'),
  P_('balada', 'Balada Romântica', 'balada', ['piano', 'violino', 'cello', 'orquestra', 'bat-suave', 'build'], 'lenta', 'amor e saudade'),
  P_('rap', 'Rap / Hip Hop', 'rap', ['beat', 'piano', 'baixo-groove', 'backing', 'adlibs'], 'media', 'superação, sonhos e a vida na cidade'),
  P_('trap', 'Trap', 'trap', ['trap', 'synth-lead', 'pads', 'adlibs', 'vocoder'], 'media', 'conquistas, sonhos e superação'),
  P_('eletronica', 'Eletrônica / Dance', 'eletronica', ['house', 'edm-drop', 'synth-lead', 'piano-house', 'pads', 'build'], 'animada', 'festa, liberdade e noite'),
  P_('axe', 'Axé', 'axe', ['percussao', 'naipe', 'guit-limpa', 'baixo-groove', 'palmas', 'alegre'], 'animada', 'carnaval, verão e alegria'),
  P_('country', 'Country', 'country', ['slide', 'gaita', 'violino', 'dedilhado', 'bat-suave'], 'media', 'estrada, liberdade e a vida no interior'),
  P_('lofi', 'Lo-fi / Relax', 'lofi', ['rhodes', 'beat', 'pads', 'guit-limpa', 'intima', 'lofi'], 'lenta', 'calma, estudo e noites tranquilas'),
  P_('infantil', 'Infantil', 'infantil', ['piano', 'flauta', 'guit-limpa', 'palmas', 'alegre'], 'animada', 'brincadeiras, amizade e aprender coisas novas'),
];
