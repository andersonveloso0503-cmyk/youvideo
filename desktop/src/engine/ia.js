// Títulos, descrições e tags com SEO para YouTube (Groq — mesma chave da legenda).
// 1) A IA descobre os termos-semente do vídeo
// 2) Busca o que as pessoas REALMENTE pesquisam no YouTube (autocompletar da busca)
// 3) Escreve 3 opções de título + descrição + tags usando essas palavras
const MODELO = 'openai/gpt-oss-120b';
const MODELO_RESERVA = 'llama-3.3-70b-versatile';

function limparNome(nome) {
  return String(nome || '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Gêneros: se o dono pediu um estilo, nada de outro gênero aparecer no título
const GENEROS = [
  ['gospel', 'louvor', 'louvores', 'adoração', 'adoracao', 'hino', 'hinos', 'worship', 'cristã', 'crista', 'cristão', 'cristao', 'evangélica', 'evangelica', 'evangélico', 'evangelico', 'católica', 'catolica', 'fé', 'deus', 'jesus'],
  ['rock', 'metal', 'heavy', 'hard rock', 'punk', 'grunge'],
  ['sertanejo', 'sertaneja', 'modão', 'modao', 'moda de viola', 'arrocha'],
  ['funk', 'baile'],
  ['pagode', 'samba'],
  ['forró', 'forro', 'piseiro', 'xote', 'baião', 'baiao'],
  ['rap', 'trap', 'hip hop', 'hip-hop'],
  ['eletrônica', 'eletronica', 'electronic', 'edm', 'house', 'techno', 'trance'],
  ['blues'],
  ['jazz'],
  ['reggae'],
  ['soul', 'r&b', 'rnb'],
  ['mpb'],
  ['pop'],
  ['country'],
  ['lofi', 'lo-fi'],
  ['clássica', 'classica', 'orquestra', 'piano clássico'],
  ['kpop', 'k-pop'],
];
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function temPalavra(texto, termo) {
  const t = ` ${semAcento(texto).replace(/[^a-z0-9]+/g, ' ')} `;
  return t.includes(` ${semAcento(termo).replace(/[^a-z0-9]+/g, ' ').trim()} `);
}
function gruposDe(texto) {
  return GENEROS.map((g, i) => (g.some((w) => temPalavra(texto, w)) ? i : -1)).filter((i) => i >= 0);
}
/** Palavras de gênero que NÃO combinam com o pedido do dono. */
function generosProibidos(pedido) {
  const permitidos = gruposDe(pedido);
  if (!permitidos.length) return [];
  return GENEROS.filter((_, i) => !permitidos.includes(i)).flat();
}
function violaPedido(texto, proibidos) {
  return proibidos.some((w) => temPalavra(texto, w));
}
function palavras(t) {
  return new Set(semAcento(t).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2));
}
function parecido(a, b) {
  const A = palavras(a), B = palavras(b);
  if (!A.size || !B.size) return 0;
  let comum = 0;
  for (const w of A) if (B.has(w)) comum++;
  return comum / Math.min(A.size, B.size);
}

const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'pra', 'com', 'em', 'no', 'na', 'the', 'of', 'for']);
/** As 2 primeiras palavras que importam do título (é o que o YouTube e a pessoa veem primeiro). */
function abertura(t) {
  return semAcento(t).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !VAZIAS.has(w)).slice(0, 2).join(' ');
}
function singular(w) {
  return w.replace(/(oes|aes)$/, 'ao').replace(/es$/, '').replace(/s$/, '');
}
function mesmaAbertura(a, b) {
  const A = abertura(a).split(' ').map(singular), B = abertura(b).split(' ').map(singular);
  return A.length && A[0] === B[0] && (A[1] || '') === (B[1] || '');
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Quanto a Groq mandou esperar (cabeçalho retry-after ou "try again in 1m2.5s"). */
function tempoDeEspera(r, msg) {
  const h = Number(r.headers.get('retry-after'));
  if (h > 0) return h * 1000;
  const m = String(msg || '').match(/try again in\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i);
  if (!m) return 0;
  return ((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)) * 1000;
}

async function chamarGroq(groqKey, mensagens, { modelo = MODELO, temperatura = 0.7, tokens = 2500 } = {}) {
  const tentar = async (m) => {
    for (let volta = 0; ; volta++) {
      let r;
      try {
        r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: m,
            messages: mensagens,
            temperature: temperatura,
            max_completion_tokens: tokens,
            response_format: { type: 'json_object' },
            ...(m.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          }),
          signal: AbortSignal.timeout(60000), // nunca fica travado esperando
        });
      } catch (e) {
        if (volta < 1) continue; // uma nova tentativa se a conexão caiu / demorou
        const err = new Error(e.name === 'TimeoutError' ? 'A IA demorou demais para responder.' : 'Sem conexão com a IA (Groq).');
        err.status = 0;
        throw err;
      }
      const d = await r.json().catch(() => null);
      if (r.ok) return lerJson(d?.choices?.[0]?.message?.content || '');
      const msg = d?.error?.message || `Groq respondeu ${r.status}`;
      // Limite por minuto da conta grátis: espera o tempo pedido e tenta de novo
      if (r.status === 429) {
        const espera = tempoDeEspera(r, msg);
        if (espera && espera <= 90000 && volta < 4) {
          await dormir(espera + 500);
          continue;
        }
        const e = new Error(espera > 90000
          ? `A IA (Groq) atingiu o limite de uso agora. Tente de novo em ${Math.ceil(espera / 60000)} min.`
          : 'A IA (Groq) está no limite de uso. Tente de novo em 1 minuto.');
        e.status = 429;
        throw e;
      }
      if (r.status >= 500 && volta < 2) {
        await dormir(3000);
        continue;
      }
      const e = new Error(msg);
      e.status = r.status;
      throw e;
    }
  };
  try {
    return await tentar(modelo);
  } catch (e) {
    if (e.status === 401) throw new Error('A chave da Groq foi recusada. Confira em Configurações.');
    try {
      return await tentar(MODELO_RESERVA);
    } catch (e2) {
      throw e.status === 429 ? e : e2;
    }
  }
}

function lerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    const m = String(texto).match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('A IA respondeu num formato inesperado. Tente de novo.');
  }
}

/** Sugestões reais da busca do YouTube (o que aparece enquanto a pessoa digita). */
async function sugestoesYoutube(termo, idioma = 'pt') {
  const gl = idioma === 'pt' ? 'BR' : idioma === 'es' ? 'MX' : 'US';
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=${idioma}&gl=${gl}&q=${encodeURIComponent(termo)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const buf = Buffer.from(await r.arrayBuffer());
    // A resposta às vezes vem em latin1
    let txt = buf.toString('utf8');
    if (txt.includes('�')) txt = buf.toString('latin1');
    const d = JSON.parse(txt);
    return Array.isArray(d?.[1]) ? d[1].map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function palavrasPesquisadas(groqKey, info, idiomaCodigo) {
  let sementes = [];
  try {
    const r = await chamarGroq(
      groqKey,
      [
        {
          role: 'system',
          content:
            'Você é especialista em pesquisa de palavras-chave do YouTube. Responda só JSON: {"sementes": ["...", "...", "...", "...", "..."]}. ' +
            'Dê 5 termos CURTOS (2 a 4 palavras, minúsculas, sem emoji) que uma pessoa digitaria na busca do YouTube para achar este vídeo: ' +
            'gênero/estilo, ocasião de uso (ex.: para dirigir, para trabalhar, para dormir, para orar), formato (ex.: playlist, coletânea, desenho animado) e o tema principal. ' +
            'Não use nomes de artistas que não estejam na informação. ' +
            'Se houver PEDIDO DO DONO DO CANAL, TODOS os termos precisam ser do estilo/tema do pedido (ex.: pedido "louvores gospel" → "louvores gospel", "louvor para orar", "hinos de adoração"...). Nunca invente outro gênero musical.',
        },
        { role: 'user', content: descreverVideo(info) },
      ],
      { temperatura: 0.3, tokens: 400 }
    );
    sementes = (r.sementes || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean).slice(0, 6);
  } catch {}
  const proibidos = generosProibidos(info.pedido);
  sementes = sementes.filter((x) => !violaPedido(x, proibidos));
  // O próprio pedido também vira busca (é o que o dono quer aparecer)
  const doPedido = String(info.pedido || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
  if (doPedido && !sementes.includes(doPedido)) sementes.unshift(doPedido);
  if (!sementes.length) sementes = [limparNome(info.nome).toLowerCase().split(' ').slice(0, 3).join(' ')];

  const vistos = new Set();
  const lista = [];
  const resultados = await Promise.all(sementes.map((s) => sugestoesYoutube(s, idiomaCodigo)));
  // Intercala: as primeiras sugestões de cada semente são as mais buscadas
  for (let i = 0; i < 10; i++) {
    for (const r of resultados) {
      const s = r[i];
      if (s && !vistos.has(s.toLowerCase()) && !violaPedido(s, proibidos)) {
        vistos.add(s.toLowerCase());
        lista.push(s);
      }
    }
  }
  return { sementes, pesquisados: lista.slice(0, 35) };
}

function descreverVideo(info) {
  const horas = info.duracaoSeg ? Math.floor(info.duracaoSeg / 3600) : 0;
  const minutos = info.duracaoSeg ? Math.round((info.duracaoSeg % 3600) / 60) : 0;
  const duracao = info.duracaoSeg ? (horas ? `${horas}h${minutos ? String(minutos).padStart(2, '0') : ''}` : `${minutos} min`) : 'desconhecida';
  const musicas = (info.musicas || []).filter(Boolean).slice(0, 40);
  return [
    info.pedido ? `PEDIDO DO DONO DO CANAL (obrigatório — manda no estilo, no gênero e no tema): ${info.pedido}` : '',
    `Nome do arquivo do vídeo: ${limparNome(info.nome)}`,
    `Duração: ${duracao}${info.curto ? ' (Shorts vertical)' : ''}`,
    musicas.length ? `Músicas no vídeo (${musicas.length}):\n- ${musicas.join('\n- ')}` : '',
    info.clima ? `Clima das músicas (medido ouvindo o áudio): ${info.clima}` : '',
    info.canal ? `Canal: ${info.canal}` : '',
    info.contexto ? `Sobre o canal / instruções extras: ${info.contexto}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Título de história bíblica: nome claro do acontecimento + o que dá vontade de assistir.
// (É o formato dos canais novos de histórias bíblicas que mais crescem; "Por Que...?" em todo vídeo não funciona.)
const COMECO_FRACO = /^\s*(por ?que|descubra|voc[eê] sabia|conhe[cç]a|veja|saiba|entenda)\b/i;
const REGRAS_TITULO_HISTORIA = `ESTE VÍDEO É UMA HISTÓRIA BÍBLICA NARRADA (não é música). Para ele, as REGRAS DO TÍTULO acima são TROCADAS por estas:
1. Comece pelo NOME do acontecimento ou do personagem, do jeito que as pessoas procuram ("Daniel na Cova dos Leões", "Davi e Golias", "A Multiplicação dos Pães").
2. Depois de ": " ou " — ", complete com a lição da história ou com o detalhe que dá vontade de assistir.
3. Entre 35 e 60 caracteres. Português correto e natural: leia em voz alta — se soar estranho ou não fizer sentido, reescreva.
4. PROIBIDO começar com "Por Que", "Descubra", "Você Sabia", "Conheça", "Veja", "Saiba". Proibido frase inteira no lugar do título e proibido inventar fato que não está na Bíblia.
5. As 3 opções: (a) nome + "a História Bíblica de [tema]", (b) nome + a lição, (c) nome + o detalhe curioso.
6. Sem emoji no meio. Sem aspas. Sem hashtag (o app coloca).
Exemplos só da FORMA: "Davi e Golias: a Pedra que Derrubou o Gigante", "Rute e Noemi — a Lealdade que Mudou uma Família", "Elias no Monte Carmelo: a História Bíblica do Fogo do Céu".
A palavra_principal continua sendo a busca da lista que melhor descreve a história.`;

/**
 * Títulos novos para vídeos de história bíblica que já estão no canal com título fraco.
 * videos = [{ id, titulo, descricao }] -> { id: 'título novo' } (só os que a IA conseguiu melhorar).
 */
async function titulosHistoria(groqKey, videos) {
  if (!groqKey) throw new Error('Para gerar com IA, cadastre a chave da Groq em Configurações.');
  const saida = {};
  for (let i = 0; i < videos.length; i += 12) {
    const lote = videos.slice(i, i + 12);
    const j = await chamarGroq(
      groqKey,
      [
        {
          role: 'system',
          content:
            'Você escreve títulos de vídeos de histórias bíblicas para o YouTube, em português do Brasil. ' +
            'Responda SOMENTE com JSON: {"titulos": [{"id": "...", "titulo": "..."}]} — um para cada vídeo recebido, com o mesmo id.\n' +
            'Descubra de qual história é cada vídeo pelo título atual e pela descrição. Se não der para saber qual é a história, devolva "titulo": "" para aquele id (não invente).\n' +
            REGRAS_TITULO_HISTORIA.split('\n').slice(1, 7).join('\n') +
            '\nCada título precisa ser diferente dos outros da lista.',
        },
        { role: 'user', content: lote.map((v) => `id: ${v.id}\ntítulo atual: ${v.titulo}\ndescrição: ${String(v.descricao || '').replace(/\s+/g, ' ').slice(0, 350)}`).join('\n\n') },
      ],
      { temperatura: 0.7, tokens: 1800 }
    );
    for (const t of Array.isArray(j.titulos) ? j.titulos : []) {
      const novo = String(t?.titulo || '').replace(/^["'“]|["'”]$/g, '').replace(/\s*#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
      const original = lote.find((v) => v.id === t?.id);
      if (!original || novo.length < 12 || COMECO_FRACO.test(novo)) continue;
      // Mantém o #Shorts se o título antigo já tinha
      saida[original.id] = comHashtags(novo.slice(0, 80), ['histórias da bíblia'], /#shorts\b/i.test(original.titulo));
    }
  }
  return saida;
}

/**
 * Gera { titulo, opcoes: [3 títulos], descricao, tags, pesquisados }.
 * info = { nome, musicas: [titulos], duracaoSeg, curto, canal, contexto, pedido, idioma, clima, evitar }
 */
// Junta até 2 hashtags curtas no fim do título (Shorts: 1 + #Shorts), sem passar de 100 caracteres
function comHashtags(titulo, candidatas, curto) {
  let base = String(titulo || '').replace(/\s*#shorts\b/gi, '').trim();
  const ja = (base.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase());
  const virar = (t) => '#' + String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).join('');
  const escolhidas = [];
  for (const c of candidatas) {
    if (!c) continue;
    const palavras = String(c).trim().split(/\s+/);
    if (palavras.length > 3) continue;
    const h = virar(c);
    if (h.length < 4 || h.length > 22) continue;
    if (ja.includes(h) || escolhidas.includes(h)) continue;
    escolhidas.push(h);
    if (escolhidas.length >= (curto ? 1 : 2)) break;
  }
  const fim = [...escolhidas, ...(curto ? ['#Shorts'] : [])];
  while (fim.length) {
    const t = `${base} ${fim.join(' ')}`.trim();
    if (t.length <= 100) return t;
    fim.shift(); // não coube: tira uma hashtag (o #Shorts fica por último)
  }
  return base.slice(0, 100);
}

async function gerarTextosVideo(groqKey, info) {
  if (!groqKey) throw new Error('Para gerar com IA, cadastre a chave da Groq em Configurações.');
  const idiomaCodigo = info.idioma === 'en' ? 'en' : info.idioma === 'es' ? 'es' : 'pt';
  const idioma = { en: 'inglês', es: 'espanhol', pt: 'português do Brasil' }[idiomaCodigo];
  const ano = new Date().getFullYear();

  const { pesquisados } = await palavrasPesquisadas(groqKey, info, idiomaCodigo);
  const evitar = (info.evitar || []).filter(Boolean);
  // História bíblica: o título começa pelo nome do personagem/acontecimento (regras próprias, mais abaixo)
  const historia = info.tipo === 'historia';
  const aberturasUsadas = historia ? [] : [...new Set(evitar.map(abertura).filter(Boolean))];
  // Cada vídeo do lote ganha uma palavra-chave de abertura diferente
  let chaveObrigatoria = '';
  if (evitar.length) {
    const livres = pesquisados.filter((p) => !evitar.some((e) => mesmaAbertura(p, e)));
    const porAbertura = [];
    for (const p of livres) if (!porAbertura.some((x) => mesmaAbertura(x, p))) porAbertura.push(p);
    if (porAbertura.length) {
      const ini = evitar.length % porAbertura.length;
      chaveObrigatoria = [...porAbertura.slice(ini), ...porAbertura.slice(0, ini)].slice(0, 4).map((x) => `"${x}"`).join(', ');
    }
  }

  const sistema = `Você é um estrategista de SEO do YouTube especializado em canais de música e vídeos cristãos, e escreve em ${idioma}.
Responda SOMENTE com JSON: {"palavra_principal": "...", "opcoes": ["título 1", "título 2", "título 3"], "melhor": 0, "descricao": "...", "tags": ["...", "..."]}

COMO ESCOLHER AS PALAVRAS
- Você recebe a lista "PESQUISADO NO YOUTUBE": são buscas REAIS que as pessoas fazem (autocompletar do YouTube). Use essas expressões EXATAS, sem trocar a ordem das palavras.
- palavra_principal = a busca da lista que melhor descreve ESTE vídeo (a mais específica que ainda é popular).

REGRA NÚMERO 1 — O PEDIDO DO DONO
- Se vier "PEDIDO DO DONO DO CANAL", ele manda: gênero, estilo e tema do título, da descrição e das tags são os do pedido.
- NUNCA coloque outro gênero musical (ex.: pedido de louvores gospel → nada de rock, sertanejo, pop, funk, eletrônica...). Nome de arquivo, nome das músicas e a lista de buscas NÃO mudam o gênero pedido.

REGRAS DO TÍTULO (as 3 opções seguem todas):
1. A palavra_principal fica nas PRIMEIRAS palavras do título (o YouTube dá mais peso ao começo).
2. Inclua uma segunda busca da lista (ocasião de uso, sentimento ou estilo) — sem repetir palavras à toa.
3. Entre 45 e 70 caracteres (depois de ~70 o título é cortado no celular). Nunca passe de 95.
4. Vídeo longo (mais de 30 min): coloque a duração arredondada ("1 Hora", "2 Horas", "3 Horas") — isso é muito buscado em playlist.
5. Pode usar o ano ${ano} se fizer sentido (playlist, "as melhores", coletânea).
6. Separe as partes com " | " ou " — ". No máximo 1 emoji, no fim ou entre as partes. Pode usar 1 a 3 palavras em CAIXA ALTA para destacar, nunca o título inteiro.
7. Nada de clickbait falso, nada de aspas, nada de "Parte 1" nem "Versão 2" (a não ser que o nome do arquivo seja uma série numerada de verdade), nenhum nome de artista que não esteja na informação.
   A PRIMEIRA música da lista é a que abre o vídeo — pode usar o estilo dela como destaque.
8. As 3 opções devem ter ângulos diferentes: (a) busca direta, (b) ocasião/benefício ("para dirigir", "para trabalhar e focar", "para orar"), (c) emoção/curiosidade.
9. RESPEITE O CLIMA DAS MÚSICAS quando ele vier na informação (foi medido ouvindo o áudio):
   - CALMO/LENTO → ocasiões e palavras calmas: relaxar, dormir, estudar, orar, meditar, "suave", "tranquilo", "acústico", "para ouvir à noite". NUNCA "treinar", "agitado", "pesado", "festa".
   - MODERADO → trabalhar, dirigir na estrada, fim de semana, "boas vibrações", "para ouvir o dia todo".
   - ANIMADO/AGITADO → treinar, academia, dirigir, festa, animar o dia, "pesado", "energia", "agitado". NUNCA "relaxar", "dormir", "calmo".
   - MISTURADO (várias calmas e várias animadas) → evite prometer um clima só; use a ocasião mais neutra.
   Escolha, da lista PESQUISADO NO YOUTUBE, as buscas que combinam com esse clima.

EXEMPLOS DO PADRÃO CERTO (só a forma — o gênero é sempre o do vídeo/pedido)
- Gospel: "Louvores de Adoração ${ano} | 1 Hora de Músicas Gospel Para Orar 🙏"
- Gospel: "Hinos Para Acalmar o Coração — Louvores Para Ouvir Antes de Dormir"
- Playlist: "PLAYLIST SERTANEJA ${ano} — As Melhores Para Ouvir no Carro"
- Desenho bíblico: "A Arca de Noé em Desenho Animado | História Bíblica para Crianças"
- Corte cômico (Short): "Jonas e a Baleia Mas Ninguém Esperava Isso 😂 #Shorts"

DESCRIÇÃO
- 1ª frase (até 150 caracteres) começa com a palavra_principal — é o que aparece na busca.
- Depois 2 ou 3 parágrafos curtos e naturais usando outras buscas da lista (sem virar lista de palavras).
- Convite para curtir, comentar e se inscrever — escrito com palavras diferentes a cada vídeo.
- Cada descrição precisa soar ÚNICA: varie o jeito de começar (pergunta, cena, benefício, convite, curiosidade), o tamanho das frases e o convite final.
- Comece cada frase com letra maiúscula (português correto), mesmo que a busca da lista esteja em minúsculas.
- Termine com 3 a 5 hashtags relevantes (a primeira = palavra_principal sem espaços).
- NÃO escreva lista de músicas nem minutagem (o app coloca sozinho).

TAGS
- 15 a 25 tags: primeiro as buscas exatas da lista que combinam com o vídeo, depois variações e termos amplos. Sem "#". Total até 450 caracteres.${
    info.curto ? '\n\nÉ um YouTube Shorts: títulos de até 60 caracteres, com #Shorts no fim do título e nas hashtags. A DESCRIÇÃO do Short é CURTA: no máximo 3 frases (até 350 caracteres) — a 1ª com a palavra_principal, depois o convite para se inscrever — e as hashtags. Nada de vários parágrafos.' : ''
  }${
    historia ? `\n\n${REGRAS_TITULO_HISTORIA}` : ''
  }`;

  const usuario = `${descreverVideo(info)}
${
    aberturasUsadas.length
      ? `\nCOMEÇOS PROIBIDOS (outros vídeos desta leva já começam assim — o seu título NÃO pode começar com estas palavras, nem no singular/plural): ${aberturasUsadas.map((a) => `"${a}"`).join(', ')}\n${
          chaveObrigatoria
            ? `Escolha a palavra_principal entre estas buscas (que combine com o clima) e comece os títulos com ela: ${chaveObrigatoria}.`
            : 'Comece com outra busca da lista ou com um gancho diferente (ex.: "1 Hora de...", "Para Orar...", "Hinos que...", "Música para...") e a palavra-chave logo depois.'
        }\n`
      : ''
  }

${
    info.evitar?.length
      ? `TÍTULOS JÁ USADOS EM OUTROS VÍDEOS DESTA MESMA LEVA (mesmas músicas em outra ordem) — os seus 3 títulos precisam ser CLARAMENTE DIFERENTES destes: comece com OUTRAS palavras, use outra palavra_principal da lista, outra ocasião e outro gancho (o YouTube trata títulos repetidos como spam). Não repita a mesma estrutura:\n${info.evitar.map((t) => `- ${t}`).join('\n')}\n\n`
      : ''
  }${
    info.evitarInicios?.length
      ? `COMEÇOS DE DESCRIÇÃO JÁ USADOS (a sua descrição NÃO pode começar igual nem parecido com estes):\n${info.evitarInicios.map((t) => `- ${t}`).join('\n')}\n\n`
      : ''
  }PESQUISADO NO YOUTUBE (buscas reais, das mais populares para as menos):
${pesquisados.length ? pesquisados.map((p) => `- ${p}`).join('\n') : '(não foi possível consultar — use os termos mais buscados que você conhece para esse nicho)'}`;

  const proibidos = generosProibidos(info.pedido);
  const limparTitulo = (t) => String(t || '').replace(/^["'“]|["'”]$/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const bom = (t) =>
    !violaPedido(t, proibidos) &&
    !(historia && COMECO_FRACO.test(t)) &&
    !evitar.some((e) => parecido(t, e) >= 0.7 || (!historia && mesmaAbertura(t, e)));

  let j, opcoes = [], melhor = 0, sobras = [];
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const extra = tentativa
      ? `\n\nATENÇÃO: a resposta anterior ${proibidos.length ? 'usou um gênero que o dono NÃO pediu ou ' : ''}ficou parecida demais com títulos já usados ou começou com as mesmas palavras. Siga o PEDIDO DO DONO e escreva 3 títulos que comecem com palavras DIFERENTES dos COMEÇOS PROIBIDOS.`
      : '';
    j = await chamarGroq(groqKey, [
      { role: 'system', content: sistema },
      { role: 'user', content: usuario + extra },
    ], { temperatura: evitar.length || tentativa ? 0.9 : 0.7 });
    const todas = (Array.isArray(j.opcoes) ? j.opcoes : [j.titulo]).map(limparTitulo).filter(Boolean);
    const escolhida = todas[Math.max(0, Math.min(todas.length - 1, Number(j.melhor) || 0))];
    sobras.push(...todas.filter((t) => !violaPedido(t, proibidos)));
    opcoes = todas.filter(bom);
    if (opcoes.length) {
      melhor = Math.max(0, opcoes.indexOf(escolhida));
      break;
    }
  }
  if (!opcoes.length && sobras.length) {
    // Nenhuma saiu perfeita: fica com a que menos se parece com as já usadas
    const nota = (t) => evitar.reduce((a, e) => a + parecido(t, e) + (mesmaAbertura(t, e) ? 1 : 0), 0);
    opcoes = [...new Set(sobras)].sort((a, b) => nota(a) - nota(b)).slice(0, 3);
  }
  if (!opcoes.length) opcoes = [limparNome(info.pedido || info.nome)];
  let tags = (Array.isArray(j.tags) ? j.tags : String(j.tags || '').split(','))
    .map((t) => String(t).replace(/^#/, '').trim())
    .filter(Boolean)
    .filter((t) => !violaPedido(t, proibidos));
  // O YouTube aceita até 500 caracteres de tags no total
  const cabem = [];
  let total = 0;
  for (const t of tags) {
    if (total + t.length + 1 > 480) break;
    cabem.push(t);
    total += t.length + 1;
  }
  tags = cabem.slice(0, 30);

  // Hashtags no título (o YouTube mostra como link e ajuda a cair na busca daquele assunto)
  const principal = String(j.palavra_principal || '').trim();
  // Primeira letra maiúscula (as buscas do YouTube vêm em minúsculas)
  const maiuscula = (t) => String(t || '').replace(/^([^\p{L}]*)(\p{Ll})/u, (_, a, b) => a + b.toUpperCase());
  // História bíblica: sempre a mesma hashtag do assunto (a pessoa clica e cai nas outras histórias)
  opcoes = opcoes.map((t) => comHashtags(maiuscula(t), historia ? ['histórias da bíblia'] : [principal, ...tags], !!info.curto));
  j.descricao = String(j?.descricao || '').split('\n').map(maiuscula).join('\n');

  return {
    titulo: opcoes[melhor],
    opcoes,
    descricao: String(j?.descricao || '').trim(),
    tags,
    palavraPrincipal: j.palavra_principal || '',
    pesquisados,
  };
}

module.exports = { gerarTextosVideo, limparNome, sugestoesYoutube, comHashtags, titulosHistoria, GENEROS, temPalavra, gruposDe };
