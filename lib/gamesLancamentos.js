// "Lançamentos" do canal de games (Próxima Fase): jogos que acabaram de sair ou estão chegando,
// com DADOS REAIS da loja da Steam (data, plataformas, preço em reais, gênero) e cenas com os
// trailers e imagens OFICIAIS de cada jogo ("@ jogo: Nome" → lib/games.js, vídeo primeiro).

import crypto from 'crypto';
import { ia } from './gamesNoticias';

const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';
const RUIDO = /soundtrack|dlc|season pass|expansion pack|bundle|upgrade|artbook|demo|playtest|steam deck|cosmetic/i;

async function detalhes(appid) {
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=BR&l=portuguese`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const d = (await r.json())?.[appid]?.data;
  if (!d?.name || d.type !== 'game') return null;
  const semTags = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const plat = Object.entries(d.platforms || {}).filter(([, v]) => v).map(([k]) => ({ windows: 'PC', mac: 'Mac', linux: 'Linux' })[k] || k);
  return {
    appid,
    nome: d.name,
    descricao: semTags(d.short_description).slice(0, 400),
    generos: (d.genres || []).map((g) => g.description).slice(0, 3).join(', '),
    data: d.release_date?.date || '',
    emBreve: !!d.release_date?.coming_soon,
    gratis: !!d.is_free,
    preco: d.price_overview?.final_formatted || '',
    plataformas: plat.join(', '),
    desenvolvedora: (d.developers || [])[0] || '',
    temVideo: (d.movies || []).length > 0,
    recomendacoes: d.recommendations?.total || 0,
  };
}

/**
 * Jogos para o vídeo de lançamentos: os que estão chegando e os que acabaram de sair na Steam (Brasil),
 * só jogos (sem DLC/trilha), só com trailer (para o vídeo ser em movimento). Devolve até `quantos`.
 */
export async function jogosDeLancamento(quantos = 5) {
  const r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=BR&l=portuguese', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`A loja da Steam não respondeu (${r.status}).`);
  const c = await r.json();
  const ids = [];
  for (const it of [...(c.coming_soon?.items || []), ...(c.new_releases?.items || [])]) {
    if (!it?.id || RUIDO.test(it.name || '') || ids.includes(it.id)) continue;
    ids.push(it.id);
  }
  const lista = [];
  for (const id of ids.slice(0, 24)) {
    const d = await detalhes(id).catch(() => null);
    if (d && d.temVideo) lista.push(d);
    if (lista.length >= quantos + 3) break;
  }
  // Os mais esperados primeiro (os já lançados com mais avaliações também sobem)
  lista.sort((a, b) => Number(b.emBreve) - Number(a.emBreve) || b.recomendacoes - a.recomendacoes);
  return lista.slice(0, quantos);
}

const hashtags = (tags) => (tags || []).slice(0, 4).map((t) => '#' + String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');

/** Episódio pronto (formato da Fábrica). formato 'short' = ~50 s com 4-5 jogos; 'longo' = ~8 min com 8-10 jogos. */
export async function roteiroLancamentos({ formato = 'short' } = {}) {
  const longo = formato === 'longo';
  const jogos = await jogosDeLancamento(longo ? 10 : 5);
  if (jogos.length < 3) throw new Error('A Steam não trouxe lançamentos com trailer agora. Tente mais tarde.');
  const dados = jogos
    .map((g, i) => `${i + 1}. ${g.nome} | ${g.emBreve ? 'chega em' : 'lançado em'}: ${g.data || 'data a confirmar'} | ${g.gratis ? 'grátis' : g.preco ? `preço na Steam Brasil: ${g.preco}` : 'preço ainda não divulgado'} | ${g.plataformas} | ${g.generos} | ${g.desenvolvedora}\n   ${g.descricao}`)
    .join('\n');
  const j = await ia(
    'Você escreve vídeos de LANÇAMENTOS DE JOGOS para o canal brasileiro "Próxima Fase". Use SÓ os dados da lista (data, preço, plataforma, gênero, descrição da loja): ' +
      'não invente nada. Se o preço não foi divulgado, não fale de preço. Português do Brasil, jeito jovem e animado, frases curtas, números e datas por extenso. ' +
      (longo
        ? 'Vídeo de 7 a 9 minutos (1100 a 1300 palavras): abertura com gancho e pedido de inscrição, um bloco por jogo (4 a 6 cenas: o que é, data, preço, plataforma e a opinião do canal sobre por que vale a pena ficar de olho), final com pergunta para os comentários. '
        : 'Short de 45 a 55 segundos (110 a 140 palavras): a primeira frase já é o gancho ("os jogos que chegam essa semana"), uma ou duas frases por jogo com data e o que ele tem de legal, a última frase pede para comentar qual vai jogar. ') +
      'Toda cena usa "jogo: <nome EXATO da lista>" (traz o trailer oficial). ' +
      'Responda só JSON: {"titulo":"até 85 caracteres","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"até 3 palavras","cenas":[{"jogo":"nome exato","texto":"...","capitulo":"(só no vídeo longo) nome do jogo no 1º bloco dele"}],"tags":["8 a 12 tags"]}',
    `Lançamentos (dados da loja da Steam no Brasil):\n${dados}`
  );
  const nomes = new Set(jogos.map((g) => g.nome));
  const linhas = [];
  let capAtual = '';
  for (const c of j.cenas || []) {
    const texto = String(c.texto || '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const jogo = nomes.has(c.jogo) ? c.jogo : jogos[0].nome;
    if (longo) {
      const cap = String(c.capitulo || '').trim();
      if (cap && cap !== capAtual) {
        linhas.push(`# ${cap.slice(0, 60)}`);
        capAtual = cap;
      } else if (!capAtual) {
        linhas.push('# Abertura');
        capAtual = 'Abertura';
      }
    }
    linhas.push(`@ jogo: ${jogo}`, texto);
  }
  const tags = (j.tags || []).map(String).slice(0, 12);
  const titulo = String(j.titulo || 'Os jogos que chegam essa semana').slice(0, 95);
  return {
    jogos,
    ep: {
      id: `lancamentos-${formato}-${crypto.createHash('sha1').update(jogos.map((g) => g.appid).join(',')).digest('hex').slice(0, 10)}`,
      titulo,
      thumb: String(j.thumb || 'LANÇAMENTOS DA SEMANA').toUpperCase().slice(0, 40),
      thumbSub: String(j.thumbSub || '').slice(0, 30),
      capa: `jogo: ${jogos[0].nome}`,
      ritmo: 'games',
      cauda: false,
      musica: 'Energetic modern electronic beat, upbeat hype gaming trailer vibe, no vocals',
      ...(longo ? { playlist: { titulo: 'Lançamentos de jogos', descricao: 'Os jogos que estão chegando e os que acabaram de sair, toda semana. Inscreva-se no Próxima Fase!' } } : {}),
      descricao: [
        titulo,
        'Os jogos deste vídeo:\n' + jogos.map((g) => `• ${g.nome} — ${g.emBreve ? 'chega em' : 'saiu em'} ${g.data || 'data a confirmar'}${g.gratis ? ' — grátis' : g.preco ? ` — ${g.preco} na Steam` : ''} (${g.plataformas})`).join('\n'),
        'Datas e preços da loja da Steam no Brasil; podem mudar. Imagens: trailers oficiais dos jogos.',
        '🔔 Inscreva-se no Próxima Fase: lançamentos e novidades dos games toda semana.\n💬 Qual desses você vai jogar? Comenta aqui!',
        `${hashtags(tags)} #lancamentos #games${longo ? '' : ' #shorts'}`,
      ].join('\n\n'),
      tags: [...tags, 'lançamentos de jogos', 'jogos novos', 'próxima fase'],
      texto: linhas.join('\n'),
    },
  };
}
