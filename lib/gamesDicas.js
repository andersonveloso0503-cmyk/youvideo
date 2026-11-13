// Vídeos de DICAS do canal de games "Próxima Fase" (ex.: "10 dicas para começar bem em Red Dead Redemption 2").
// Imagens: gameplay e trailers OFICIAIS do jogo (página da Steam) + screenshots oficiais (IGDB/Steam) — nada de vídeo de outros canais.
// Texto: o Claude PESQUISA as dicas na web (busca da Anthropic) antes de escrever, para não inventar nada.
// Cada roteiro fica esperando o dono aprovar no Compilador (mesma lista das notícias).

import { steamAppId } from './games';
import { CLAUDE_URL, modeloClaude } from './textoNoClaude';

const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';

/** Jogos mais vendidos da Steam no Brasil agora (dados reais da loja). */
export async function jogosEmAlta(quantos = 3) {
  const r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=BR&l=portuguese', { headers: { 'User-Agent': UA } });
  if (!r.ok) return [];
  const d = await r.json();
  const nomes = [...(d.top_sellers?.items || []), ...(d.specials?.items || [])]
    .map((x) => String(x.name || '').trim())
    .filter((n) => n && !/steam deck|soundtrack|dlc|pack|bundle|edition upgrade|season pass/i.test(n));
  return [...new Set(nomes)].slice(0, quantos);
}

/** Dados oficiais da loja (nome certo, descrição, gêneros) para a IA não confundir o jogo. */
async function dadosDaLoja(nome) {
  const appid = await steamAppId(nome);
  if (!appid) return null;
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=portuguese`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const d = (await r.json())?.[appid]?.data;
  if (!d?.name) return null;
  const semTags = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    nome: d.name,
    descricao: semTags(d.short_description || d.about_the_game).slice(0, 800),
    generos: (d.genres || []).map((g) => g.description).join(', '),
    temVideo: (d.movies || []).length > 0,
  };
}

/** Pede ao Claude com busca na web; devolve o JSON da resposta final. */
export async function claudeComBusca(sistema, pedido) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('Os vídeos de dicas precisam da ANTHROPIC_API_KEY na Vercel (o Claude pesquisa as dicas na web).');
  // Claude sobrecarregado (503/529/overloaded) acontece em horário de pico: tenta de novo até 3 vezes antes de desistir
  let r;
  let d;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(240000),
      body: JSON.stringify({
        model: modeloClaude(),
        max_tokens: 16000,
        system: sistema,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: pedido }],
      }),
    });
    d = await r.json().catch(() => null);
    if (![429, 500, 502, 503, 529].includes(r.status) && d?.error?.type !== 'overloaded_error') break;
    console.log(`[claude-busca] Claude ocupado (${r.status}), tentando de novo (${tentativa + 1}/3)`);
    await new Promise((ok) => setTimeout(ok, 8000 * (tentativa + 1)));
  }
  if (!r.ok) throw new Error(d?.error?.message || `Claude respondeu ${r.status}`);
  const texto = (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const fontes = [];
  for (const c of d.content || []) {
    if (c.type === 'web_search_tool_result' && Array.isArray(c.content)) {
      for (const x of c.content) if (x.url && !fontes.some((f) => f.url === x.url)) fontes.push({ titulo: x.title || x.url, url: x.url });
    }
  }
  let json = lerJson(texto);
  if (!json) {
    // A resposta veio com o JSON quebrado ou cortado: pede só para arrumar (sem pesquisar de novo)
    if (d.stop_reason === 'max_tokens') throw new Error('O roteiro ficou grande demais e foi cortado. Tente de novo (ou escolha Short).');
    json = await consertarJson(key, texto);
  }
  if (!json) throw new Error('O Claude pesquisou, mas não devolveu o roteiro no formato certo. Tente de novo.');
  return { json, fontes };
}

/** Acha o JSON no fim da resposta (com ou sem ```json), tentando do último "{" que fecha certo. */
function lerJson(texto) {
  const t = String(texto || '').replace(/```(?:json)?/gi, '');
  const fim = t.lastIndexOf('}');
  if (fim < 0) return null;
  for (let ini = t.indexOf('{'); ini >= 0 && ini < fim; ini = t.indexOf('{', ini + 1)) {
    try {
      const j = JSON.parse(t.slice(ini, fim + 1));
      if (j && typeof j === 'object') return j;
    } catch {
      /* tenta o próximo "{" */
    }
  }
  return null;
}

async function consertarJson(key, texto) {
  try {
    const r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model: modeloClaude(),
        max_tokens: 16000,
        system: 'Você recebe uma resposta que deveria terminar com um JSON. Devolva SÓ o JSON válido (mesmas chaves e textos), sem comentário e sem ```.',
        messages: [{ role: 'user', content: String(texto).slice(-60000) }],
      }),
    });
    const d = await r.json().catch(() => null);
    return lerJson((d?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'));
  } catch {
    return null;
  }
}

/** Escreve o vídeo de dicas de UM jogo. Devolve { ep, fontes } no formato da Fábrica. */
export async function roteiroDicas(nomePedido) {
  const loja = await dadosDaLoja(nomePedido);
  if (!loja) throw new Error(`Não achei "${nomePedido}" na Steam (as imagens e a gameplay oficiais vêm de lá). Confira o nome do jogo.`);
  const jogo = loja.nome;
  const { json: j, fontes } = await claudeComBusca(
    'Você escreve vídeos de DICAS de games para o canal brasileiro "Próxima Fase". ' +
      'ANTES de escrever, pesquise na web (guias, wikis do jogo, sites de games) dicas reais e atuais do jogo. ' +
      'Use SÓ dicas que você encontrou na pesquisa: não invente item, missão, local, comando, número nem nome. ' +
      'Prefira dicas que servem para todo mundo (começo do jogo, erros comuns, segredos úteis, como ganhar dinheiro/experiência, configurações). ' +
      'Não dê comandos de botão específicos de uma plataforma, a menos que a fonte diga e você indique a plataforma. ' +
      'Português do Brasil, jeito jovem e animado, frases curtas, sem palavrão. Números por extenso. Não copie frases das fontes: reescreva. ' +
      'No final da sua resposta, coloque SÓ um JSON (sem texto depois) assim: ' +
      '{"titulo":"até 90 caracteres, ex.: 10 dicas para começar bem em <jogo>","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras",' +
      '"abertura":["2 ou 3 frases: o gancho e um convite para se inscrever"],' +
      '"dicas":[{"titulo":"nome curto da dica","texto":["2 a 4 frases explicando a dica"]}],' +
      '"final":["2 frases: resumo e pergunta para os comentários"],"tags":["8 a 12 tags"]}. ' +
      'Entre 8 e 10 dicas, do total de 1100 a 1300 palavras.',
    `Jogo: ${jogo}\nGêneros: ${loja.generos}\nDescrição oficial da loja: ${loja.descricao}`
  );
  const limpa = (f) => String(f || '').replace(/\bjogo:\s*/gi, '').replace(/[぀-ヿ㐀-鿿가-힯]+/g, '').replace(/\s+/g, ' ').trim();
  const cena = (frase) => `@ jogo: ${jogo}\n${limpa(frase)}`;
  const partes = ['# Abertura', ...(j.abertura || []).map(cena)];
  (j.dicas || []).forEach((d, i) => {
    const titulo = String(d.titulo || `Dica ${i + 1}`).slice(0, 60);
    const frases = Array.isArray(d.texto) ? d.texto : [d.texto];
    partes.push(`# ${i + 1}. ${titulo}`);
    frases.filter(Boolean).forEach((f, k) => partes.push(k === 0 ? `@ jogo: ${jogo} | Dica ${i + 1} | ${titulo}\n${limpa(f)}` : cena(f)));
  });
  partes.push('# Final', ...(j.final || []).map(cena));
  const tags = (j.tags || []).map(String).slice(0, 12);
  const hashtags = tags.slice(0, 4).map((t) => '#' + t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');
  const slug = jogo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ep = {
    id: `dicas-${slug}-${Date.now().toString(36)}`,
    titulo: String(j.titulo || `Dicas de ${jogo}`).slice(0, 100),
    thumb: String(j.thumb || 'DICAS').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').slice(0, 30),
    capa: `jogo: ${jogo}`,
    ritmo: 'games',
    cauda: false,
    musica: 'Upbeat modern electronic beat, positive and energetic, video game tutorial vibe, no vocals',
    playlist: { titulo: 'Dicas de jogos', descricao: 'Dicas, segredos e erros de iniciante dos jogos mais jogados. Inscreva-se no Próxima Fase!' },
    descricao: [
      String(j.titulo || ''),
      `Imagens: gameplay e trailers oficiais de ${jogo}.`,
      fontes.length ? 'Fontes das dicas:\n' + fontes.slice(0, 6).map((f) => `• ${f.titulo}: ${f.url}`).join('\n') : '',
      '🔔 Inscreva-se no Próxima Fase: novidades, listas e dicas dos games toda semana.\n💬 Qual dica você não conhecia? Comenta aqui!',
      `${hashtags} #dicas #games`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, `dicas ${jogo}`, 'dicas de jogos', 'próxima fase'],
    texto: partes.join('\n'),
  };
  return { ep, fontes, jogo, temVideo: loja.temVideo };
}

/**
 * Short ILUSTRADO sobre um tema de games (ex.: "Quanto vai custar o GTA 6 no Brasil?", "Faltam 14 dias para o GTA 6").
 * Não depende da Steam (GTA 6 e jogos de console não estão lá): a explicação vem das ilustrações animadas,
 * e os "fatos" da pesquisa servem para conferir cada número antes de virar desenho.
 */
export async function roteiroTemaGames(tema) {
  const { json: j, fontes } = await claudeComBusca(
    'Você escreve Shorts do canal brasileiro de GAMES "Próxima Fase", no estilo explicador com ilustrações (cada frase vira um desenho animado que explica a ideia). ' +
      'ANTES de escrever, pesquise na web (sites de games, anúncios oficiais, lojas) e use SÓ o que encontrou: não invente preço, data, recurso, nome nem rumor. ' +
      'Se algo é rumor ou não foi confirmado, diga que é rumor. Português do Brasil, jeito jovem e animado, frases curtas, sem palavrão. Números por extenso na fala. ' +
      'O Short tem de 140 a 170 palavras (55 a 70 segundos), em 9 a 11 cenas curtas: gancho forte na primeira frase (curiosidade ou número), o que se sabe, os números, o que muda para quem joga, ' +
      'e a última cena com uma pergunta + uma PALAVRA-CHAVE para comentar ("Comenta JOGARIA ou PASSO", "Comenta SIM ou NÃO") + "se inscreve no Próxima Fase". ' +
      'Em "midia" escreva em INGLÊS uma busca de vídeo de banco que combine (ex.: "gamer playing console at night", "city skyline at sunset neon"). ' +
      'No final da sua resposta, coloque SÓ um JSON (sem texto depois) assim: ' +
      '{"titulo":"até 90 caracteres, curiosidade ou pergunta","jogo":"nome OFICIAL em inglês do jogo principal do tema (ex.: Grand Theft Auto VI, Dragon Ball: Sparking! Zero) ou vazio se o tema não é de um jogo","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras",' +
      '"cenas":[{"midia":"...","texto":"..."}],"tags":["8 a 12 tags"],' +
      '"fatos":["6 a 12 fatos curtos COM os números, datas e nomes exatamente como estão nas fontes (com algarismos)"]}.',
    `Tema do Short: ${tema}\nData de hoje: ${new Date().toISOString().slice(0, 10)}`
  );
  const cenas = (j?.cenas || []).filter((c) => c && c.texto).slice(0, 14);
  if (cenas.length < 4) throw new Error('A pesquisa não rendeu um roteiro (poucas cenas). Tente escrever o tema de outro jeito.');
  const limpa = (f) => String(f || '').replace(/\s+/g, ' ').trim();
  const texto = cenas.map((c) => `@ vídeo atual: ${limpa(c.midia || 'gamer playing video game').slice(0, 80)}\n${limpa(c.texto)}`).join('\n\n');
  const tags = (j.tags || []).map(String).slice(0, 12);
  const hashtags = tags.slice(0, 4).map((t) => '#' + t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');
  const slug = String(tema).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ep = {
    id: `tema-${slug}-${Date.now().toString(36)}`,
    titulo: String(j.titulo || tema).slice(0, 100),
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').slice(0, 30),
    ritmo: 'games',
    cauda: false,
    // Capa: arte oficial do jogo principal (personagem e logo grandes)
    ...(limpa(j.jogo) ? { capa: `jogo: ${limpa(j.jogo).slice(0, 80)}` } : {}),
    musica: 'Upbeat modern electronic beat, positive and energetic, video game news vibe, no vocals',
    descricao: [
      String(j.titulo || tema),
      fontes.length ? 'Fontes:\n' + fontes.slice(0, 6).map((f) => `• ${f.titulo}: ${f.url}`).join('\n') : '',
      '🔔 Inscreva-se no Próxima Fase: novidades dos games todo dia.\n💬 Comenta aqui o que você achou!',
      `${hashtags} #games #shorts`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'games', 'próxima fase'],
    texto,
    fatos: (Array.isArray(j.fatos) ? j.fatos : []).map((f) => String(f).slice(0, 300)).slice(0, 14),
  };
  return { ep, fontes };
}

/**
 * VÍDEO LONGO de CURIOSIDADES (8 a 12 min) sobre um tema de games, modelado em vídeos que deram certo.
 * Cada item mostra a gameplay/trailer OFICIAL do jogo que está sendo falado ("@ jogo: Nome").
 */
export async function roteiroLongoGames(tema, tituloSugerido = '') {
  const { json: j, fontes } = await claudeComBusca(
    'Você escreve VÍDEOS LONGOS de CURIOSIDADES do canal brasileiro de GAMES "Próxima Fase" (8 a 12 minutos). ' +
      'ANTES de escrever, pesquise na web (sites de games, wikis, entrevistas dos criadores, anúncios oficiais) e use SÓ o que encontrou: não invente data, número, nome, segredo nem declaração. Rumor é dito como rumor. ' +
      'Português do Brasil, jeito jovem e animado mas claro, frases curtas, sem palavrão. Números por extenso na fala. Não copie frases das fontes. ' +
      'ESTRUTURA: abertura de 3 a 4 frases (a 1ª frase até 12 palavras com a curiosidade mais forte; a 2ª promete algo que só vem no fim: "e a última é a mais estranha"; convite rápido para se inscrever); ' +
      '8 a 10 itens numerados, do menos ao mais impressionante, cada um com 4 a 7 frases (o fato, o detalhe que pouca gente sabe, por que isso importa); final de 2 a 3 frases com a pergunta para os comentários. ' +
      'Total de 1300 a 1600 palavras. ' +
      'No final da sua resposta, coloque SÓ um JSON (sem texto depois) assim: ' +
      '{"titulo":"até 80 caracteres, curiosidade forte sem mentir","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras","jogo":"nome OFICIAL em inglês do jogo principal",' +
      '"abertura":["frases"],"itens":[{"titulo":"nome curto do item","jogo":"nome OFICIAL em inglês do jogo deste item","texto":["frases"]}],"final":["frases"],"tags":["8 a 12 tags"],' +
      '"fatos":["8 a 14 fatos curtos COM os números, datas e nomes exatamente como estão nas fontes"]}',
    `Tema do vídeo: ${tema}${tituloSugerido ? `\nTítulo sugerido (pode melhorar): ${tituloSugerido}` : ''}\nData de hoje: ${new Date().toISOString().slice(0, 10)}`
  );
  const itens = (j?.itens || []).filter((x) => x && x.texto);
  if (itens.length < 5) throw new Error('A pesquisa não rendeu itens suficientes para o vídeo longo.');
  const limpa = (f) => String(f || '').replace(/\bjogo:\s*/gi, '').replace(/[぀-ヿ㐀-鿿가-힯]+/g, '').replace(/\s+/g, ' ').trim();
  const principal = limpa(j.jogo) || limpa(itens[0].jogo) || 'video game';
  const cena = (jogo, frase) => `@ jogo: ${jogo}\n${limpa(frase)}`;
  const partes = ['# Abertura', ...(j.abertura || []).map((f) => cena(principal, f))];
  itens.forEach((it, i) => {
    const jogo = limpa(it.jogo) || principal;
    const titulo = String(it.titulo || `Curiosidade ${i + 1}`).slice(0, 60);
    const frases = (Array.isArray(it.texto) ? it.texto : [it.texto]).filter(Boolean);
    partes.push(`# ${i + 1}. ${titulo}`);
    frases.forEach((f, k) => partes.push(k === 0 ? `@ jogo: ${jogo} | ${i + 1} | ${titulo}\n${limpa(f)}` : cena(jogo, f)));
  });
  partes.push('# Final', ...(j.final || []).map((f) => cena(principal, f)));
  const tags = (j.tags || []).map(String).slice(0, 12);
  const hashtags = tags.slice(0, 4).map((t) => '#' + t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');
  const slug = String(tema).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ep = {
    id: `longo-${slug}-${Date.now().toString(36)}`,
    titulo: String(j.titulo || tituloSugerido || tema).slice(0, 100),
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').slice(0, 30),
    capa: `jogo: ${principal}`,
    ritmo: 'games',
    cauda: false,
    musica: 'Upbeat modern electronic beat, curious and energetic, video game documentary vibe, no vocals',
    playlist: { titulo: 'Curiosidades dos Games', descricao: 'Segredos, curiosidades e histórias dos jogos que você ama. Inscreva-se no Próxima Fase!' },
    descricao: [
      String(j.titulo || tema),
      'Imagens: gameplay e trailers oficiais dos jogos citados.',
      fontes.length ? 'Fontes:\n' + fontes.slice(0, 8).map((f) => `• ${f.titulo}: ${f.url}`).join('\n') : '',
      '🔔 Inscreva-se no Próxima Fase: curiosidades e novidades dos games toda semana.\n💬 Qual curiosidade você não conhecia? Comenta aqui!',
      `${hashtags} #games #curiosidades`,
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'curiosidades de jogos', 'próxima fase'],
    texto: partes.join('\n'),
    fatos: (Array.isArray(j.fatos) ? j.fatos : []).map((f) => String(f).slice(0, 300)).slice(0, 16),
  };
  return { ep, fontes, jogo: principal };
}
