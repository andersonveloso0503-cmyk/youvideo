// Fábrica INFANTIL: episódios de historinha animada (~4 a 5 min) com um personagem fixo
// e uma MÚSICA CHICLETE dentro de cada episódio.
//
// Como o episódio é montado:
//   1) Roteiro em 3 blocos: "antes" da música, a "música" (letra própria) e "depois" (moral e tchau)
//   2) Narração do bloco antes + música cantada (Estúdio de Música, ElevenLabs) + narração do bloco depois
//   3) Imagens de cada cena com a ficha do personagem como referência (o personagem não muda de cara)
//   4) Animação das cenas (fal.ai) e montagem no PC, só no YouTube, marcado como "conteúdo para crianças"
import { getDb } from './firebase-admin';

// Personagem padrão da primeira série (o dono escolheu o Pingo)
export const PERSONAGEM_PADRAO = {
  nome: 'Pingo',
  descricao:
    'Pingo, a small cute water droplet character, translucent light blue glossy body with soft highlights, big round shiny black eyes with white sparkles, rosy pink cheeks, tiny friendly smile, small rounded arms and tiny feet, a little curled tip on top of his head, a tiny sparkle glowing inside his body',
  personalidade: 'gotinha d\'água curiosa, alegre e corajosa, que mora num lago de uma floresta mágica',
  mundo: 'floresta mágica com cogumelos gigantes coloridos, flores sorridentes, um lago brilhante e um vale de flores',
  amigos: 'Zuzu (abelhinha que zumbe e fala rápido), Sapo Tonico (sapo velho e sábio de óculos), Margarida (flor doce) e Dona Nuvem (nuvem carinhosa)',
};

// Episódios já planejados para a série do Pingo (entram primeiro, na ordem)
export const EPISODIOS_PINGO = [
  'Pingo e a Flor com Sede — ninguém é pequeno demais para ajudar; juntos a gente consegue',
  'Pingo e o Medo do Escuro — coragem, com a ajuda de um vagalume',
  'Pingo Vira Nuvem — o ciclo da água de um jeito mágico',
  'Pingo e o Amigo Diferente — aceitar as diferenças',
  'Pingo e a Poça Bagunceira — arrumar a bagunça e cuidar da natureza',
  'Pingo Aprende a Esperar — paciência, plantando uma semente com a Margarida',
];

export const ESTILO_INFANTIL =
  "cute 3D animated children's movie style, soft warm lighting, vibrant pastel colors, rounded friendly shapes, big expressive eyes, magical cheerful atmosphere, high detail, 16:9 cinematic frame";
const PROIBIDO =
  'No text, no letters, no logos, no watermark, no buttons, no user interface, no subscribe or like icons. ' +
  'No humans, no people, no children, no human hands or human bodies. Nothing scary, no weapons, no violence, no sad crying close-ups, no known cartoon characters or brands.';

// Estilo da música (o Estúdio reconhece "children" e usa o cantor infantil)
export const ESTILO_MUSICA =
  "Upbeat catchy children's song, Brazilian Portuguese, cheerful young female lead vocal with a group of kids singing the chorus, ukulele, xylophone, hand claps, playful bouncy rhythm, 120 bpm, sing-along, simple and repetitive, very clear words";
export const DURACAO_MUSICA = 60; // segundos (refrão, verso, refrão, contagem, refrão)

export const slug = (t) =>
  String(t || 'personagem').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'personagem';

/** Personagem vindo da tela (ou o Pingo). */
export function normalizarPersonagem(p) {
  const base = !p || !String(p.nome || '').trim() || slug(p.nome) === 'pingo' ? PERSONAGEM_PADRAO : {};
  return {
    nome: String(p?.nome || base.nome || 'Pingo').trim().slice(0, 40),
    descricao: String(p?.descricao || base.descricao || '').trim().slice(0, 600),
    personalidade: String(p?.personalidade || base.personalidade || '').trim().slice(0, 300),
    mundo: String(p?.mundo || base.mundo || '').trim().slice(0, 300),
    amigos: String(p?.amigos || base.amigos || '').trim().slice(0, 400),
  };
}

// ───────── Groq (mesmo jeito do resto do Youvideo: modelo grande, cai para o llama se falhar) ─────────
async function groqJson(sistema, usuario, { temperatura = 0.9, maxTokens = 7000 } = {}) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada na Vercel.');
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: temperatura,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: usuario },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}');
  };
  try {
    return await pedir('openai/gpt-oss-120b');
  } catch {
    return await pedir('llama-3.3-70b-versatile');
  }
}

/** Temas de novos episódios (título + lição), sem repetir os já usados. */
export async function temasInfantisDaIa(qtd, personagem, evitar = []) {
  const p = normalizarPersonagem(personagem);
  const j = await groqJson(
    `Você planeja episódios de um desenho animado infantil brasileiro (crianças de 2 a 6 anos) com o personagem ${p.nome} (${p.personalidade}). ` +
      `Mundo: ${p.mundo}. Amigos: ${p.amigos}. ` +
      'Cada episódio tem uma aventura simples e UMA lição clara (amizade, coragem, dividir, paciência, cuidar da natureza, aceitar diferenças, ' +
      'escovar os dentes, dormir cedo, falar a verdade, pedir desculpas, cores, números, animais...). Nada assustador, nada triste demais. ' +
      'Responda só JSON: {"temas": ["Título do episódio — lição em poucas palavras", ...]}. O título começa com o nome do personagem.',
    `Quero ${qtd} episódios diferentes.\n\nJá usados (não repetir nem parecido):\n${evitar.slice(0, 200).map((t) => `- ${t}`).join('\n') || '(nenhum)'}`
  );
  const vistos = new Set(evitar.map((t) => String(t).toLowerCase()));
  return (Array.isArray(j.temas) ? j.temas : []).map((t) => String(t).trim()).filter((t) => t && !vistos.has(t.toLowerCase())).slice(0, qtd);
}

/**
 * Roteiro do episódio em 3 blocos. As descrições visuais vêm em INGLÊS (o Flux entende melhor);
 * a narração e a letra em português do Brasil.
 */
export async function gerarRoteiroInfantil({ tema, personagem, duracaoSeg = 270 }) {
  const p = normalizarPersonagem(personagem);
  const falaSeg = Math.max(120, duracaoSeg - DURACAO_MUSICA);
  const cenasPorBloco = Math.max(7, Math.min(26, Math.round(falaSeg / 2 / 9))); // 4 min ≈ 12 por bloco; 8 min ≈ 24
  // Fala infantil é calma: ~2,2 palavras por segundo. Sem uma meta clara, a IA escreve falas curtas demais
  // e o episódio sai com 2 minutos em vez de 4.
  const palavrasBloco = Math.round((falaSeg / 2) * 2.2);
  const palavrasCena = Math.max(9, Math.round(palavrasBloco / (cenasPorBloco * 2)));
  const contar = (lista) => (Array.isArray(lista) ? lista : []).reduce((t, c) => t + (Array.isArray(c?.falas) ? c.falas : []).reduce((a, f) => a + String(f?.texto || '').split(/\s+/).filter(Boolean).length, 0), 0);
  const pedirRoteiro = (extra) => groqJson(
    'Você é roteirista de desenho animado infantil brasileiro para o YouTube (crianças de 2 a 6 anos). ' +
      'Escreve histórias curtas, alegres e com uma lição, no estilo dos grandes canais infantis: frases curtas, palavras simples, ' +
      'onomatopeias (splash!, bzzz!, uiii!), repetição, perguntas para a criança ("e você, amiguinho, sabe o que ele fez?"). ' +
      'É um DESENHO COM DIÁLOGO: o Narrador conta a história e cada personagem fala com a PRÓPRIA voz (as falas dos personagens NÃO vão dentro do texto do narrador). ' +
      'Diálogo de verdade: um personagem responde ao outro, com emoção e personalidade (o Pingo curioso e animado, a Zuzu rápida, o Sapo Tonico calmo e sábio). ' +
      'Nada de frases repetidas, nada de todo mundo dizendo a mesma coisa, nada de o narrador repetir o que o personagem acabou de dizer. O narrador só liga as partes, com frases curtas. ' +
      'Nada assustador, nada de violência, nada de personagens ou marcas conhecidas.\n\n' +
      `Personagem principal: ${p.nome} — ${p.personalidade}. Aparência: ${p.descricao}.\n` +
      `Mundo: ${p.mundo}. Amigos que podem aparecer: ${p.amigos}.\n\n` +
      'O episódio tem 3 blocos:\n' +
      `1) "antes": ${cenasPorBloco * 2} cenas. Apresenta o ${p.nome}, mostra o problema e termina no momento em que os personagens começam a CANTAR (ex.: "E sabe o que eles fizeram? Cantaram bem alto!").\n` +
      '2) "musica": uma música CHICLETE original sobre a aventura, que a criança quer cantar junto. Letra de 16 a 22 linhas com as marcações [Refrão], [Verso], [Refrão], [Contagem] e [Refrão] (cerca de 1 minuto cantada); ' +
      `pode ter uma [Contagem] ou palminhas. O refrão tem 4 linhas, rima, uma onomatopeia ou palavra inventada divertida e o nome do ${p.nome}, e aparece pelo menos 2 vezes. ` +
      'Palavras bem simples, frases de 4 a 7 sílabas. Mais 8 cenas visuais para o clipe da música, com os personagens dançando, pulando e fazendo o que a letra diz.\n' +
      `3) "depois": ${cenasPorBloco * 2} cenas. Resolve a aventura, mostra a lição dita pelo ${p.nome} olhando para a criança e termina com "Tchau, amiguinho! Até a próxima aventura!".\n\n` +
      'Cada cena tem: "descricao" = descrição visual EM INGLÊS de UMA imagem (quem aparece, o que faz, a expressão, o lugar; quem está falando aparece em destaque), ' +
      `sempre chamando o personagem pelo nome (${p.nome}). Nas imagens só aparecem o ${p.nome}, os amigos listados e outras gotinhas, bichinhos e plantas do mundo dele: NUNCA pessoas, crianças ou humanos, e nunca botões ou telas; e "falas" = UMA fala só (UM personagem falando por cena, CERCA DE ${palavrasCena} PALAVRAS, uns 5 segundos), no formato ` +
      '{"personagem": "Narrador" ou o nome do personagem, "texto": "frase curta", "sexo": "homem" ou "mulher", "voz": "normal", "aguda" (bichinho pequeno, criança, inseto) ou "grave" (bicho grande ou velho)}. ' +
      `REGRA DE OURO: cada cena mostra QUEM ESTÁ FALANDO. Se quem fala é um personagem, a "descricao" é ele em destaque (close ou meio corpo), falando, com a expressão da fala; se é o Narrador, a "descricao" mostra a ação que ele conta. ` +
      `Alterne narração e diálogo; o ${p.nome} fala em boa parte das cenas. ` +
      `TAMANHO É OBRIGATÓRIO: cada bloco ("antes" e "depois") precisa somar cerca de ${palavrasBloco} palavras de fala. Não resuma: conte a história com calma, com detalhes, perguntas para a criança e falas dos amigos. ` +
      'Em mais ou menos metade das cenas, ponha também "som" = um EFEITO SONORO curto em INGLÊS que combine com a ação (ex.: "water droplet splash", "bee buzzing", "frog croak", "magical sparkle chime", "leaves rustling", "happy kids cheering", "footsteps on grass"); nas outras, "som": "". Nada de música no som.\n\n' +
      'Responda só JSON: {"titulo": "título para o YouTube: nome do episódio | Historinha Infantil Animada com Música", ' +
      '"descricao": "descrição do YouTube em 3 parágrafos curtos: a aventura, a lição e o convite para cantar junto e se inscrever (sem link)", ' +
      '"tags": ["12 a 15 tags: historinha infantil, desenho animado infantil, música infantil, nome do personagem, a lição..."], ' +
      '"thumbnailTitulo": "2 a 4 palavras para a capa", "licao": "a lição em 1 frase", ' +
      '"antes": [{"descricao": "...", "som": "water droplet splash", "falas": [{"personagem": "Narrador", "texto": "...", "sexo": "mulher", "voz": "normal"}]}], "musica": {"titulo": "nome da música", "letra": "letra com as marcações", "cenas": ["descrição visual em inglês", "...", "...", "..."]}, ' +
      '"depois": [{"descricao": "...", "falas": [...]}]}',
    `Episódio: ${tema}${extra || ''}`,
    { temperatura: 0.85, maxTokens: cenasPorBloco > 14 ? 22000 : 13000 }
  );
  // Até 3 tentativas: se vier curto, pede de novo dizendo quanto faltou (fica com o mais longo)
  let j = null;
  let melhor = -1;
  let extra = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let r;
    try {
      r = await pedirRoteiro(extra);
    } catch (e) {
      if (!j) throw e;
      break;
    }
    const total = contar(r.antes) + contar(r.depois);
    if (total > melhor) {
      j = r;
      melhor = total;
    }
    if (total >= palavrasBloco * 2 * 0.8) break;
    extra = `\n\nATENÇÃO: a versão anterior ficou curta demais (${total} palavras de fala no total). ` +
      `Escreva de novo com ${palavrasBloco * 2} palavras no total (${palavrasBloco} em "antes" e ${palavrasBloco} em "depois"), ${cenasPorBloco * 2} cenas em cada bloco, UMA fala por cena, cerca de ${palavrasCena} palavras por fala.`;
  }

  const ehPrincipal = (nome) => slug(nome) === slug(p.nome);
  // Mesmo personagem = sempre o mesmo nome, o mesmo tom e o mesmo sexo (a IA às vezes escreve "Tonico" e depois
  // "Sapo Tonico", ou marca a Zuzu "aguda" numa fala e "normal" na outra — e a voz trocava no meio do episódio)
  const elenco = {}; // slug canônico -> { nome, vozTipo, sexo }
  const canonico = (bruto) => {
    const s = slug(bruto);
    const base = slug(p.nome);
    // "Pinguinho", "Gotinha Pingo", "Pingo" = o mesmo personagem
    if (s.includes(base) || (base.length >= 4 && s.replace(/^.*-/, '').startsWith(base.slice(0, 4)))) return p.nome;
    for (const [k, v] of Object.entries(elenco)) if (s.includes(k) || k.includes(s)) return v.nome;
    return bruto;
  };
  const fixar = (nome, voz, sexo) => {
    const k = slug(nome);
    if (!elenco[k]) {
      elenco[k] = {
        nome,
        // Sem efeito de tom: mesmo leve, deixava a voz robótica. A diferença vem de vozes diferentes.
        vozTipo: 'normal',
        // O personagem principal fala com voz feminina (soa como criança, e combina com quem canta a música)
        sexo: ehPrincipal(nome) ? 'mulher' : sexo === 'homem' ? 'homem' : sexo === 'mulher' ? 'mulher' : '',
      };
    }
    return elenco[k];
  };
  const limpar = (lista) =>
    (Array.isArray(lista) ? lista : [])
      .map((c) => {
        let falas = (Array.isArray(c?.falas) ? c.falas : [])
          .map((f) => {
            const bruto = String(f?.personagem || 'Narrador').trim().slice(0, 40) || 'Narrador';
            const texto = String(f?.texto || '').trim().slice(0, 300);
            if (/^narrador/i.test(bruto)) return { personagem: 'Narrador', texto, sexo: '', vozTipo: 'normal' };
            const ficha = fixar(canonico(bruto), f?.voz, f?.sexo);
            return { personagem: ficha.nome, texto, sexo: ficha.sexo, vozTipo: ficha.vozTipo };
          })
          .filter((f) => f.texto);
        // Modelo antigo (só narração): vira uma fala do narrador
        if (!falas.length && String(c?.textoNarrado || '').trim()) falas = [{ personagem: 'Narrador', texto: String(c.textoNarrado).trim().slice(0, 500), sexo: '', vozTipo: 'normal' }];
        const som = String(c?.som || '').trim().replace(/[^\p{L}\p{N} ,'-]/gu, '').slice(0, 80);
        const descricao = String(c?.descricao || '').trim().slice(0, 600);
        // UM personagem por cena: se a IA juntou várias pessoas falando, vira uma cena para cada uma
        // (a imagem troca junto com a voz). Falas seguidas da mesma pessoa ficam juntas.
        const grupos = [];
        for (const f of falas) {
          const ult = grupos[grupos.length - 1];
          if (ult && ult[0].personagem === f.personagem) ult.push(f);
          else grupos.push([f]);
        }
        return grupos.map((g, i) => {
          const quem = g[0].personagem;
          // A imagem SEMPRE mostra quem está falando (antes, a fala do Pingo às vezes ia por cima da imagem da Margarida)
          const foco = quem !== 'Narrador' ? `${quem} in the center of the frame, big and in focus, speaking to a friend. ` : '';
          return {
            descricao: `${foco}${descricao}`,
            falas: g,
            textoNarrado: g.map((f) => f.texto).join(' '),
            ...(som && i === 0 ? { som } : {}),
          };
        });
      })
      .flat()
      .filter((c) => c.descricao && c.falas.length);
  const antes = limpar(j.antes);
  const depois = limpar(j.depois);
  const letra = String(j.musica?.letra || '').trim().slice(0, 1500);
  const cenasMusica = (Array.isArray(j.musica?.cenas) ? j.musica.cenas : []).map((c) => String(c?.descricao || c || '').trim()).filter(Boolean).slice(0, 10);
  if (antes.length < 4 || depois.length < 3) throw new Error('O roteiro infantil veio curto demais. Tentando de novo.');
  if (!letra) throw new Error('O roteiro infantil veio sem a letra da música. Tentando de novo.');
  while (cenasMusica.length < 6) cenasMusica.push(`${p.nome} and friends singing and dancing happily together in the ${p.mundo.split(',')[0]}, musical notes floating`);

  const titulo = String(j.titulo || tema).replace(/\s+/g, ' ').trim().slice(0, 100);
  const tituloMusica = String(j.musica?.titulo || `A Música do ${p.nome}`).trim().slice(0, 80);
  return {
    titulo,
    descricao: `${String(j.descricao || '').trim()}\n\n🎵 Música do episódio: "${tituloMusica}"\n\n${letra}`.slice(0, 4800),
    tags: (Array.isArray(j.tags) ? j.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 18),
    thumbnailTitulo: String(j.thumbnailTitulo || '').trim().slice(0, 40),
    thumbnailSubtitulo: '',
    licao: String(j.licao || '').trim().slice(0, 200),
    // Texto completo (para a biblioteca); a narração de verdade sai em 2 pedaços, antes e depois da música
    narracao: [
      ...antes.flatMap((c) => c.falas.map((f) => `${f.personagem}: ${f.texto}`)),
      `[Música: ${tituloMusica}]`,
      ...depois.flatMap((c) => c.falas.map((f) => `${f.personagem}: ${f.texto}`)),
    ].join('\n'),
    antes,
    depois,
    musica: { titulo: tituloMusica, letra, cenas: cenasMusica },
    // Todas as cenas na ordem do vídeo (as da música ganham o bloco "musica")
    cenas: [
      ...antes.map((c) => ({ ...c, bloco: 'antes' })),
      ...cenasMusica.map((d) => ({ descricao: d, textoNarrado: '', bloco: 'musica' })),
      ...depois.map((c) => ({ ...c, bloco: 'depois' })),
    ],
  };
}

// ───────── Imagens (Flux 2 Pro) com a ficha do personagem como referência ─────────
async function fluxImagem({ prompt, largura, altura, referencia }) {
  const enviar = async (comRef) => {
    const r = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: largura, height: altura, ...(comRef ? { input_image: comRef } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    return { r, d };
  };
  let { r, d } = await enviar(referencia);
  // Se a referência for recusada, gera só pelo texto (a descrição do personagem vai no prompt de qualquer jeito)
  if (!r.ok && referencia && !/insufficient credits/i.test(String(d.detail || ''))) ({ r, d } = await enviar(null));
  if (!r.ok) {
    throw new Error(/insufficient credits/i.test(String(d.detail || ''))
      ? 'Acabou o crédito do Flux (imagens). Recarregue em dashboard.bfl.ai → Credits e clique em tentar de novo.'
      : typeof d.detail === 'string' ? d.detail : 'Erro ao enviar pedido ao Flux');
  }
  for (let t = 0; t < 60; t++) {
    await new Promise((ok) => setTimeout(ok, 1000));
    const p = await (await fetch(d.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } })).json();
    if (p.status === 'Ready') {
      const { put } = await import('@vercel/blob');
      const buf = Buffer.from(await (await fetch(p.result?.sample)).arrayBuffer());
      const blob = await put(`infantil/cena-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, buf, {
        access: 'public',
        contentType: 'image/jpeg',
        token: process.env.MEDIA_READ_WRITE_TOKEN,
      });
      return blob.url;
    }
    if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(p.status)) return null;
  }
  throw new Error('Tempo esgotado gerando a imagem da cena.');
}

/** Ficha do personagem (imagem de referência), criada uma vez por personagem e guardada no banco. */
export async function garantirReferencia(personagem) {
  const p = normalizarPersonagem(personagem);
  const ref = getDb().collection('youvideo_config').doc(`infantil_${slug(p.nome)}`);
  const atual = (await ref.get()).data();
  if (atual?.refUrl && atual.descricao === p.descricao) return atual.refUrl;
  const url = await fluxImagem({
    prompt: `Character reference sheet, single character, full body front view: ${p.descricao}. Standing, happy friendly expression, centered, plain soft white background. ${ESTILO_INFANTIL}. ${PROIBIDO}`,
    largura: 1024,
    altura: 1024,
  });
  if (!url) throw new Error('O Flux recusou a ficha do personagem. Mude um pouco a descrição do personagem.');
  await ref.set({ nome: p.nome, descricao: p.descricao, refUrl: url, criadoEm: new Date().toISOString() }, { merge: true });
  return url;
}

/** Imagens de algumas cenas (a fila faz um pedaço por rodada). */
export async function gerarImagensInfantis({ cenas, personagem, referencia }) {
  const p = normalizarPersonagem(personagem);
  const arquivos = [];
  for (let cena of cenas) {
    // Clipe da música: só o elenco do mundo do personagem (no teste apareceram bonecos humanos)
    if (cena.bloco === 'musica') cena = { ...cena, descricao: `Only ${p.nome} and his animal and nature friends, no humans: ${cena.descricao}` };
    // O personagem principal aparece quando a cena fala dele ou quando ele tem fala nela
    const falam = [...new Set((cena.falas || []).map((f) => f.personagem).filter((n) => n && n !== 'Narrador'))];
    const aparece = new RegExp(p.nome, 'i').test(cena.descricao) || falam.some((n) => slug(n) === slug(p.nome)) || cena.bloco === 'musica';
    const amigoFalando = falam.find((n) => slug(n) !== slug(p.nome)) || '';
    const prompt =
      `${cena.descricao}. ` +
      (aparece
        ? `${p.nome} is EXACTLY the character in the reference image, identical shape, face, eyes and colors in every scene: ${p.descricao}. ` +
          `Only ONE ${p.nome}. He keeps his droplet body with tiny rounded arms and tiny feet, never human legs, never a human body. `
        : '') +
      // Quem fala é um amigo: ele é o destaque da imagem (o Pingo, se aparecer, fica ao lado)
      (amigoFalando ? `The one in focus, big in the center and talking, is ${amigoFalando}${aparece ? `; ${p.nome} can appear smaller beside` : ''}. ` : '') +
      `Setting: ${p.mundo}. ${ESTILO_INFANTIL}. ${PROIBIDO}`;
    let url = await fluxImagem({ prompt, largura: 1344, altura: 768, referencia: aparece ? referencia : null });
    // Barrada pelo filtro: tenta de novo com uma cena simples de quem fala (senão a imagem anterior ficava por cima da fala)
    if (!url) {
      const quem = falam[0] || p.nome;
      url = await fluxImagem({
        prompt: `${quem} smiling in the center of the frame, in ${p.mundo}. ${quem === p.nome ? `${p.nome}: ${p.descricao}. ` : ''}${ESTILO_INFANTIL}. ${PROIBIDO}`,
        largura: 1344,
        altura: 768,
        referencia: quem === p.nome ? referencia : null,
      }).catch(() => null);
    }
    // Texto para a ANIMAÇÃO: sem boca falando (a IA não sincroniza com a voz); no clipe da música todo mundo dança
    const mov = cena.bloco === 'musica'
      ? 'Everyone dances, bounces and jumps happily to the rhythm of a cheerful song.'
      : falam.length
        ? `${falam.join(' and ')} with an expressive face, small happy gestures and blinks, mouth closed in a soft smile, no lip movement.`
        : 'Gentle living movement: blinking, small head and arm movements, mouths closed, no talking.';
    arquivos.push(url
      ? { cena: `${cena.descricao}${mov ? ` ${mov}` : ''}`, textoNarrado: cena.textoNarrado || '', imageUrl: url, bloco: cena.bloco }
      : { cena: cena.descricao, erro: 'Cena barrada pelo filtro de conteúdo.', bloco: cena.bloco });
  }
  return arquivos;
}

/** Capa do episódio: o personagem grande, expressão alegre, fundo colorido (sem texto). */
export async function thumbInfantil({ personagem, referencia, titulo }) {
  const p = normalizarPersonagem(personagem);
  return fluxImagem({
    prompt:
      `YouTube thumbnail for a kids cartoon episode "${String(titulo || '').slice(0, 80)}": big close-up of ${p.descricao}, very happy excited expression with mouth open, ` +
      `waving at the viewer, bright saturated colorful background from ${p.mundo}, sparkles and musical notes, strong contrast, the character fills half of the frame on the right side. ${ESTILO_INFANTIL}. ${PROIBIDO}`,
    largura: 1344,
    altura: 768,
    referencia,
  });
}

// ───────── Vozes: cada bichinho com a SUA voz, sempre a mesma em todos os episódios ─────────
/**
 * Mapa { "Nome do personagem": "id da voz na ElevenLabs" } para a rota /api/generate-voice-dialogo.
 * A primeira vez que um personagem fala, escolhe uma voz da conta (pelo sexo) e guarda no banco;
 * nos próximos episódios usa a mesma. O narrador usa a voz escolhida na tela (ou a padrão).
 */
export async function vozesDosPersonagens({ personagem, falas, vozNarrador }) {
  const p = normalizarPersonagem(personagem);
  const ref = getDb().collection('youvideo_config').doc(`infantil_${slug(p.nome)}`);
  const salvas = ((await ref.get()).data() || {}).vozesV2 || {}; // V2: Pingo passou a ter voz feminina
  const nomes = {};
  for (const f of falas) if (f.personagem !== 'Narrador' && !nomes[slug(f.personagem)]) nomes[slug(f.personagem)] = f;
  const faltam = Object.keys(nomes).filter((k) => !salvas[k]);
  const config = (await ref.get()).data() || {};
  let narradorFixo = vozNarrador || config.narradorV2 || '';
  if (!narradorFixo || faltam.length) {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } });
    const d = await r.json().catch(() => ({}));
    const narr = vozNarrador || process.env.ELEVENLABS_VOICE_ID;
    const vozes = (d.voices || []).map((v) => ({ id: v.voice_id, genero: String(v.labels?.gender || '') })).filter((v) => v.id !== narr);
    const usadas = new Set(Object.values(salvas));
    const sexo = (v) => (/female|femin/i.test(v.genero) ? 'mulher' : /male|mascul/i.test(v.genero) ? 'homem' : '');
    // Narrador do canal infantil: uma voz feminina de contadora de histórias, escolhida uma vez e guardada
    if (!narradorFixo) {
      const contadora = (d.voices || []).find((v) => v.voice_id !== process.env.ELEVENLABS_VOICE_ID && /female|femin/i.test(v.labels?.gender || '') && /narrat|story|calm|warm|soft/i.test(`${v.labels?.use_case || ''} ${v.labels?.description || ''} ${v.description || ''}`))
        || (d.voices || []).find((v) => v.voice_id !== process.env.ELEVENLABS_VOICE_ID && /female|femin/i.test(v.labels?.gender || ''));
      if (contadora) {
        narradorFixo = contadora.voice_id;
        usadas.add(narradorFixo);
        await ref.set({ narradorV2: narradorFixo }, { merge: true });
      }
    }
    for (const k of faltam) {
      const quer = nomes[k].sexo;
      const livres = vozes.filter((v) => !usadas.has(v.id));
      const escolhida = livres.find((v) => quer && sexo(v) === quer) || livres[0] || vozes.find((v) => quer && sexo(v) === quer) || vozes[0];
      if (escolhida) {
        salvas[k] = escolhida.id;
        usadas.add(escolhida.id);
      }
    }
    await ref.set({ nome: p.nome, vozesV2: salvas }, { merge: true });
  }
  const mapa = {};
  for (const [k, f] of Object.entries(nomes)) if (salvas[k]) mapa[f.personagem] = salvas[k];
  if (narradorFixo) mapa.Narrador = narradorFixo;
  return mapa;
}

// ───────── Efeitos sonoros (splash, bzzz, sininho mágico...) ─────────
const MAX_SONS = 14; // por episódio
const VOLUME_SOM = 0.85; // um pouco abaixo das falas (0,4 ficou baixo demais no teste)

/**
 * Efeitos sonoros das cenas que pediram (campo "som" do roteiro), pela ElevenLabs.
 * Cada som fica guardado no banco: o mesmo "water droplet splash" é reaproveitado nos próximos episódios (não gasta de novo).
 * Devolve [{ indice, url, duracao }] — indice = posição da cena em roteiro.cenas. Som que falhar é pulado.
 */
export async function gerarEfeitosSonoros(roteiro) {
  const db = getDb();
  const cache = db.collection('youvideo_config').doc('infantil_sons');
  const salvos = ((await cache.get()).data() || {}).sons || {};
  const novos = {};
  const saida = [];
  let falhou = null;
  const pedidos = roteiro.cenas.map((c, indice) => ({ indice, som: c.som })).filter((x) => x.som).slice(0, MAX_SONS);
  for (const { indice, som } of pedidos) {
    const chave = slug(som);
    let item = salvos[chave] || novos[chave];
    if (!item) {
      try {
        const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
          body: JSON.stringify({ text: `${som}, cartoon sound effect for a kids animation, clean, no music, no voices`, duration_seconds: 2.5, prompt_influence: 0.5 }),
        });
        if (!r.ok) {
          falhou = falhou || (await r.text()).slice(0, 200);
          continue;
        }
        const { put } = await import('@vercel/blob');
        const blob = await put(`infantil/som-${chave}.mp3`, Buffer.from(await r.arrayBuffer()), {
          access: 'public',
          contentType: 'audio/mpeg',
          token: process.env.MEDIA_READ_WRITE_TOKEN,
          addRandomSuffix: true,
        });
        item = { url: blob.url, duracao: 2.5 };
        novos[chave] = item;
      } catch (e) {
        falhou = falhou || e.message;
        continue;
      }
    }
    saida.push({ indice, url: item.url, duracao: item.duracao || 2.5 });
  }
  if (Object.keys(novos).length) await cache.set({ sons: { ...salvos, ...novos } }, { merge: true });
  // Sem permissão de "Sound Effects" na chave: o episódio sai sem efeitos (não trava a fábrica)
  return { sons: saida, aviso: !saida.length && falhou ? `Efeitos sonoros não saíram: ${falhou}` : null };
}

/** Todas as falas de um bloco (antes ou depois), na ordem, para gerar as vozes de uma vez. */
export const falasDoBloco = (cenas) => cenas.flatMap((c) => c.falas || []);

// ───────── Tempo do vídeo: diálogo (antes) → música → diálogo (depois) ─────────
/** Tempo de cada cena a partir do tempo de cada fala (a cena vai do começo da 1ª fala até a próxima cena). */
function temposDoBloco(cenas, cenasComTempo, duracao, deslocamento) {
  let k = 0;
  const inicios = cenas.map((c) => {
    const t = cenasComTempo[k];
    k += (c.falas || []).length || 1;
    return Math.max(0, (t?.start ?? 0) - 0.15);
  });
  inicios[0] = 0;
  return inicios.map((ini, i) => {
    const fim = i + 1 < inicios.length ? inicios[i + 1] : duracao;
    return { start: Number((ini + deslocamento).toFixed(2)), length: Number(Math.max(0.5, fim - ini).toFixed(2)) };
  });
}

const fimDoBloco = (voz) => {
  const segs = voz.audioSegments || [];
  return segs.length ? Math.max(...segs.map((x) => x.start + x.length)) : 0;
};

/** Duração de um MP3 (a música do Estúdio sai em CBR 128 kbps), sem ffmpeg. */
export function duracaoMp3(buf) {
  if (!buf || buf.length < 1000) return 0;
  let i = 0;
  if (buf.slice(0, 3).toString() === 'ID3') i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const HZ = [44100, 48000, 32000, 0];
  for (; i < Math.min(buf.length - 4, i + 100000); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const mpeg1 = (buf[i + 1] & 0x18) === 0x18;
      const kbps = KBPS[(buf[i + 2] >> 4) & 0x0f];
      const hz = HZ[(buf[i + 2] >> 2) & 0x03];
      if (!mpeg1 || !kbps || !hz) continue;
      // Cabeçalho Xing/Info (VBR): número exato de quadros
      const xing = buf.indexOf('Xing', i) >= 0 && buf.indexOf('Xing', i) < i + 64 ? buf.indexOf('Xing', i) : buf.indexOf('Info', i) < i + 64 && buf.indexOf('Info', i) >= 0 ? buf.indexOf('Info', i) : -1;
      if (xing > 0 && buf[xing + 7] & 1) {
        const quadros = buf.readUInt32BE(xing + 8);
        if (quadros > 0) return (quadros * 1152) / hz;
      }
      return ((buf.length - i) * 8) / (kbps * 1000);
    }
  }
  return 0;
}

/**
 * Junta os áudios na linha do tempo (as falas do bloco antes, a música, as falas do bloco depois)
 * e dá o tempo de cada cena. Devolve { audioSegments, tempos } — tempos na mesma ordem de roteiro.cenas.
 */
export function linhaDoTempo({ roteiro, narracaoAntes, musica, narracaoDepois, sons = [] }) {
  const durA = fimDoBloco(narracaoAntes) + 0.5;
  const iniM = durA + 0.3;
  const durM = Math.max(10, Number(musica.duracao) || DURACAO_MUSICA);
  const iniD = iniM + durM + 0.4;
  const durD = fimDoBloco(narracaoDepois) + 1.5; // folga: a última fala não pode ser cortada
  // Encerramento: o começo da música do episódio volta baixinho por 8 s e some devagar (antes o vídeo parava seco)
  const iniFim = iniD + durD - 0.3;
  const durFim = 8;

  const tA = temposDoBloco(roteiro.antes, narracaoAntes.cenasComTempo || [], durA, 0);
  const nM = roteiro.musica.cenas.length;
  const tM = roteiro.musica.cenas.map((_, i) => ({ start: Number((iniM + (i * durM) / nM).toFixed(2)), length: Number((durM / nM).toFixed(2)) }));
  const tD = temposDoBloco(roteiro.depois, narracaoDepois.cenasComTempo || [], durD, iniD);
  const tempos = [...tA, ...tM, ...tD];
  const desloca = (segs, d) => (segs || []).map((x) => ({ url: x.url, start: Number((x.start + d).toFixed(2)), length: Number(x.length.toFixed(2)) }));
  return {
    audioSegments: [
      ...desloca(narracaoAntes.audioSegments, 0),
      { url: musica.audioUrl, start: Number(iniM.toFixed(2)), length: Number(durM.toFixed(2)) },
      ...desloca(narracaoDepois.audioSegments, iniD),
      { url: musica.audioUrl, start: Number(iniFim.toFixed(2)), length: durFim, volume: 0.6, fade: 3 },
      // Efeitos sonoros: entram logo que a cena começa, mais baixos que as falas
      ...sons
        .filter((x) => tempos[x.indice])
        .map((x) => ({ url: x.url, start: Number((tempos[x.indice].start + 0.2).toFixed(2)), length: Number(Math.min(x.duracao, tempos[x.indice].length).toFixed(2)), volume: VOLUME_SOM })),
    ],
    tempos,
    duracao: iniFim + durFim,
  };
}
