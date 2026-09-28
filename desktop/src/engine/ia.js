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

async function chamarGroq(groqKey, mensagens, { modelo = MODELO, temperatura = 0.7, tokens = 3000 } = {}) {
  const tentar = async (m) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: m, messages: mensagens, temperature: temperatura, max_completion_tokens: tokens, response_format: { type: 'json_object' } }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error(d?.error?.message || `Groq respondeu ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return lerJson(d?.choices?.[0]?.message?.content || '');
  };
  try {
    return await tentar(modelo);
  } catch (e) {
    if (e.status === 401) throw new Error('A chave da Groq foi recusada. Confira em Configurações.');
    return tentar(MODELO_RESERVA);
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
            'Não use nomes de artistas que não estejam na informação.',
        },
        { role: 'user', content: descreverVideo(info) },
      ],
      { temperatura: 0.3, tokens: 400 }
    );
    sementes = (r.sementes || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean).slice(0, 6);
  } catch {}
  if (!sementes.length) sementes = [limparNome(info.nome).toLowerCase().split(' ').slice(0, 3).join(' ')];

  const vistos = new Set();
  const lista = [];
  const resultados = await Promise.all(sementes.map((s) => sugestoesYoutube(s, idiomaCodigo)));
  // Intercala: as primeiras sugestões de cada semente são as mais buscadas
  for (let i = 0; i < 10; i++) {
    for (const r of resultados) {
      const s = r[i];
      if (s && !vistos.has(s.toLowerCase())) {
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

/**
 * Gera { titulo, opcoes: [3 títulos], descricao, tags, pesquisados }.
 * info = { nome, musicas: [titulos], duracaoSeg, curto, canal, contexto, idioma }
 */
async function gerarTextosVideo(groqKey, info) {
  if (!groqKey) throw new Error('Para gerar com IA, cadastre a chave da Groq em Configurações.');
  const idiomaCodigo = info.idioma === 'en' ? 'en' : info.idioma === 'es' ? 'es' : 'pt';
  const idioma = { en: 'inglês', es: 'espanhol', pt: 'português do Brasil' }[idiomaCodigo];
  const ano = new Date().getFullYear();

  const { pesquisados } = await palavrasPesquisadas(groqKey, info, idiomaCodigo);

  const sistema = `Você é um estrategista de SEO do YouTube especializado em canais de música e vídeos cristãos, e escreve em ${idioma}.
Responda SOMENTE com JSON: {"palavra_principal": "...", "opcoes": ["título 1", "título 2", "título 3"], "melhor": 0, "descricao": "...", "tags": ["...", "..."]}

COMO ESCOLHER AS PALAVRAS
- Você recebe a lista "PESQUISADO NO YOUTUBE": são buscas REAIS que as pessoas fazem (autocompletar do YouTube). Use essas expressões EXATAS, sem trocar a ordem das palavras.
- palavra_principal = a busca da lista que melhor descreve ESTE vídeo (a mais específica que ainda é popular).

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

EXEMPLOS DO PADRÃO CERTO
- Rock instrumental longo: "Rock Instrumental para Dirigir | 3 Horas de Heavy Blues Guitar 🎸"
- Playlist: "PLAYLIST ROCK NACIONAL ANOS 80 — As Melhores Para Ouvir no Carro"
- Gospel: "Louvores de Adoração ${ano} | 1 Hora de Músicas Gospel Para Orar 🙏"
- Desenho bíblico: "A Arca de Noé em Desenho Animado | História Bíblica para Crianças"
- Corte cômico (Short): "Jonas e a Baleia Mas Ninguém Esperava Isso 😂 #Shorts"

DESCRIÇÃO
- 1ª frase (até 150 caracteres) começa com a palavra_principal — é o que aparece na busca.
- Depois 2 ou 3 parágrafos curtos e naturais usando outras buscas da lista (sem virar lista de palavras).
- Convite para curtir, comentar e se inscrever.
- Termine com 3 a 5 hashtags relevantes (a primeira = palavra_principal sem espaços).
- NÃO escreva lista de músicas nem minutagem (o app coloca sozinho).

TAGS
- 15 a 25 tags: primeiro as buscas exatas da lista que combinam com o vídeo, depois variações e termos amplos. Sem "#". Total até 450 caracteres.${
    info.curto ? '\n\nÉ um YouTube Shorts: títulos de até 60 caracteres, com #Shorts no fim do título e nas hashtags.' : ''
  }`;

  const usuario = `${descreverVideo(info)}

${
    info.evitar?.length
      ? `TÍTULOS JÁ USADOS EM OUTROS VÍDEOS DESTA MESMA LEVA (mesmas músicas em outra ordem) — os seus 3 títulos precisam ser CLARAMENTE DIFERENTES destes: outra palavra_principal da lista, outra ocasião e outro gancho. Não repita a mesma estrutura:\n${info.evitar.map((t) => `- ${t}`).join('\n')}\n\n`
      : ''
  }PESQUISADO NO YOUTUBE (buscas reais, das mais populares para as menos):
${pesquisados.length ? pesquisados.map((p) => `- ${p}`).join('\n') : '(não foi possível consultar — use os termos mais buscados que você conhece para esse nicho)'}`;

  const j = await chamarGroq(groqKey, [
    { role: 'system', content: sistema },
    { role: 'user', content: usuario },
  ]);

  const limparTitulo = (t) => String(t || '').replace(/^["'“]|["'”]$/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  let opcoes = (Array.isArray(j.opcoes) ? j.opcoes : [j.titulo]).map(limparTitulo).filter(Boolean);
  if (!opcoes.length) opcoes = [limparNome(info.nome)];
  const melhor = Math.max(0, Math.min(opcoes.length - 1, Number(j.melhor) || 0));
  let tags = (Array.isArray(j.tags) ? j.tags : String(j.tags || '').split(','))
    .map((t) => String(t).replace(/^#/, '').trim())
    .filter(Boolean);
  // O YouTube aceita até 500 caracteres de tags no total
  const cabem = [];
  let total = 0;
  for (const t of tags) {
    if (total + t.length + 1 > 480) break;
    cabem.push(t);
    total += t.length + 1;
  }
  tags = cabem.slice(0, 30);

  return {
    titulo: opcoes[melhor],
    opcoes,
    descricao: String(j.descricao || '').trim(),
    tags,
    palavraPrincipal: j.palavra_principal || '',
    pesquisados,
  };
}

module.exports = { gerarTextosVideo, limparNome, sugestoesYoutube };
