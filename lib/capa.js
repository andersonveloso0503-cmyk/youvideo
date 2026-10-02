// Estúdio de Música — capa feita a partir da música (letra, tema e estilo), não genérica.
// 1) a IA de texto (Groq) lê a letra e descreve UMA cena; 2) o Flux desenha a cena.
// O título NÃO vai para o Flux: ele tenta escrever o título na imagem e erra as letras.

// Como cada gênero "se parece" numa capa. A música pode ter mais de um (ex.: pagode + louvor).
const VISUAIS = [
  { id: 'gospel', teste: /gospel|worship|louvor|adora[cç][aã]o|crist[aã]|jesus|deus\b|senhor\b|igreja|praise/i, pista: 'worship atmosphere: warm rays of heavenly golden light breaking through the clouds, people with hands raised in praise, feeling of faith, gratitude and hope' },
  { id: 'pagode', teste: /pagode|samba|cavaquinho|pandeiro/i, pista: 'Brazilian roda de samba: a group of friends sitting around a table playing cavaquinho, pandeiro and tantan, smiling and singing together, backyard gathering with string lights' },
  { id: 'sertanejo', teste: /sertanej|viola caipira|mod[aã]o/i, pista: 'Brazilian countryside: acoustic guitar and accordion, wooden fence, dirt road and open fields at sunset, cowboy hat' },
  { id: 'forro', teste: /forr[oó]|piseiro|xote|bai[aã]o|sanfona/i, pista: 'northeastern Brazil festa: accordion, zabumba and triangle, colorful little flags overhead, a couple dancing close' },
  { id: 'gaucha', teste: /ga[uú]ch|nativis|milonga|vanera|chamam[eé]/i, pista: 'the pampas of southern Brazil: a gaucho with accordion or nylon guitar, campfire, horses and wide fields at dusk' },
  { id: 'reggae', teste: /reggae|\bska\b|\bdub\b/i, pista: 'reggae vibe: tropical beach, palm trees, sunset, red, gold and green colors, hand drums and guitar, relaxed and sunny' },
  { id: 'metal', teste: /heavy metal|\bmetal\b|thrash/i, pista: 'heavy metal: dark dramatic stage, electric guitars, lightning and fire, epic and powerful' },
  { id: 'rock', teste: /\brock\b|grunge|punk/i, pista: 'rock band: electric guitar, drum kit and amplifiers on a stage, strong stage lights, energy' },
  { id: 'axe', teste: /\bax[eé](?![a-zà-ú])/i, pista: 'carnival in Salvador, Bahia: street percussion drums, colorful ribbons, festive crowd' },
  { id: 'funk', teste: /\bfunk\b|baile/i, pista: 'Rio de Janeiro baile funk: wall of big speakers, community rooftops at night, neon lights' },
  { id: 'trap', teste: /\btrap\b|\brap\b|hip.?hop/i, pista: 'urban hip hop: city street at night, graffiti wall, street lights and neon reflections' },
  { id: 'eletronica', teste: /electronic dance|\bedm\b|eletr[oô]nica|house beat/i, pista: 'electronic dance: festival stage with lasers and light beams, DJ booth, crowd silhouettes' },
  { id: 'jazz', teste: /\bjazz\b|\bsoul\b|r&b|\brnb\b|blues/i, pista: 'soul, blues and jazz club: vintage microphone, saxophone, hammond organ or electric guitar under a warm spotlight, smoky stage' },
  { id: 'mpb', teste: /\bmpb\b|bossa/i, pista: 'bossa nova and MPB: nylon guitar on a balcony by the sea in Rio de Janeiro, soft evening light' },
  { id: 'country', teste: /american country|country music/i, pista: 'country: ranch barn, acoustic guitar, hat on a fence post, open field at golden hour' },
  { id: 'infantil', teste: /children|infantil|kids/i, pista: "children's music: cute colorful cartoon scene with friendly animals and toys, playful and bright" },
  { id: 'lofi', teste: /lo-?fi|chill/i, pista: 'lo-fi: cozy room at night, rain on the window, warm lamp, headphones on a desk' },
  { id: 'balada', teste: /romantic ballad|\bballad\b|balada|rom[aâ]ntic/i, pista: 'romantic ballad: a couple seen from behind or a piano by a window, rain and soft city lights' },
  { id: 'pop', teste: /\bpop\b/i, pista: 'modern pop: vibrant colors, stylish silhouette, confetti and soft glow' },
];

/** Pistas visuais dos gêneros da música (até 2: o principal e a mistura, ex.: pagode + louvor). */
export function pistasVisuais(m) {
  const estilo = `${m.genero || ''} ${m.estilo || ''}`;
  const tudo = `${estilo} ${m.descricao || ''} ${m.titulo || ''} ${String(m.letra || '').slice(0, 1500)}`;
  // O ritmo vem do estilo; "louvor/gospel" também é percebido pela letra (ex.: pagode que fala de Deus)
  const doEstilo = VISUAIS.filter((v) => v.teste.test(estilo));
  const gospel = VISUAIS[0];
  const lista = [...doEstilo];
  if (!lista.includes(gospel) && gospel.teste.test(tudo)) lista.push(gospel);
  // ritmo primeiro, fé depois (a cena é do ritmo, banhada pela luz do louvor)
  return lista.sort((a, b) => (a.id === 'gospel') - (b.id === 'gospel')).slice(0, 2);
}

/** Letra sem as marcações [Verse], [Chorus]..., encurtada para o pedido à IA. */
export function letraParaCapa(letra) {
  return String(letra || '').split('\n').filter((l) => l.trim() && !/^\s*\[.*\]\s*$/.test(l)).join('\n').slice(0, 1800);
}

/** Pedido à IA de texto: devolve JSON { cena } em inglês. */
export function pedidoDaCena(m, pistas) {
  const letra = letraParaCapa(m.letra);
  return [
    'Você é diretor de arte de capas de música. Leia os dados da música e descreva UMA cena para a capa.',
    'Responda só JSON: {"cena": "..."}. A cena vai em INGLÊS, com 45 a 75 palavras, dizendo quem ou o que aparece, onde, a luz e as cores.',
    'Regras:',
    '- A cena tem que mostrar a história ou a mensagem DESTA música: use imagens concretas que aparecem na letra (lugares, objetos, gestos, hora do dia).',
    pistas.length
      ? `- Tem que dar para ver o gênero da música. Use estes elementos: ${pistas.map((p) => p.pista).join(' + ')}.${pistas.length > 1 ? ' Junte os dois na mesma cena.' : ''}`
      : '- Deixe claro o gênero da música pelos instrumentos e pelo ambiente.',
    '- Pessoas com aparência brasileira, sem rosto de gente famosa.',
    '- Nada de escritório, computador, mesa de trabalho ou fones, a não ser que a letra fale disso.',
    '- NÃO descreva texto, letras, palavras, placas, faixas, logotipos nem notas musicais flutuando.',
    m.instrumental ? '- A música é instrumental: mostre o instrumento principal e o clima.' : '',
    '',
    `Título: ${m.titulo || '(sem título)'}`,
    `Estilo: ${m.estilo || '(não informado)'}`,
    m.descricao ? `Ideia da música: ${m.descricao}` : '',
    letra ? `Letra:\n${letra}` : 'Letra: (não tem letra salva; baseie-se no título e no estilo)',
  ].filter(Boolean).join('\n');
}

/** Cena de reserva, se a IA de texto falhar: só as pistas do gênero e a ideia da música. */
export function cenaDeReserva(m, pistas) {
  const base = pistas.length ? pistas.map((p) => p.pista).join('; combined with ') : 'musicians playing together with joy, instruments in hand';
  return `${base}.${m.descricao ? ` Theme of the song: ${String(m.descricao).slice(0, 200)}.` : ''}`;
}

/** Prompt final do Flux. Sem o título (o Flux escreveria o título com letras erradas). */
export function promptDaCapa(cena) {
  return [
    'Square album cover artwork, rich digital illustration with painterly detail, cinematic lighting, vivid warm colors.',
    String(cena).replace(/["“”]/g, '').trim(),
    'Composition: one clear focal subject in the upper two thirds, strong silhouette, easy to read as a small thumbnail; the lower third is darker and less busy (the song title is added there later).',
    'The image contains absolutely no text: no letters, no words, no numbers, no captions, no signs, no banners, no logos, no watermark.',
  ].join(' ');
}
