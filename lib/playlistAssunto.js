// Playlist por ASSUNTO para os canais de games, política e Brasil Inacreditável.
// O vídeo entra sozinho na playlist do tema quando sobe (o Compilador cria a playlist se ainda não existir).
// Mesma regra no Compilador (desktop/src/engine/playlistAssunto.js) para arrumar os vídeos que já estavam no canal.
const sem = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const GAMES = [
  [/adivinhe|qual e o jogo|desafio/, 'Adivinhe o Jogo', 'Desafios: adivinhe o jogo pela imagem.'],
  [/\bgta\b|grand theft auto|rockstar/, 'GTA 6', 'Tudo sobre GTA 6: data, trailers, preço e novidades.'],
  [/nintendo|switch|mario|zelda|pokemon|kirby|metroid|donkey kong/, 'Nintendo', 'Notícias da Nintendo, Switch 2 e seus jogos.'],
  [/playstation|\bps[3-6]\b|ps5 pro|sony|god of war|horizon|spider-?man|gran turismo|dualsense/, 'PlayStation', 'Notícias do PlayStation e dos jogos da Sony.'],
  [/xbox|game pass|halo|bethesda|starfield|forza|gears of war|elder scrolls|fallout|call of duty/, 'Xbox', 'Notícias do Xbox, Game Pass e jogos da Microsoft.'],
  [/lancament|lanca |chega |chegou|data de|estreia|pre-?venda|preco/, 'Lançamentos de Jogos', 'Datas, preços e lançamentos de jogos.'],
];
const POLITICA = [
  [/\bstf\b|supremo|moraes|fachin|toffoli|mendonca|gilmar|dino|zanin|barroso|fux|carmen lucia|\bstj\b|\btse\b|\bcnj\b|\bpgr\b/, 'STF e Justiça', 'Decisões do STF e da Justiça, explicadas sem torcida.'],
  [/\bpf\b|policia federal|investiga|operacao|prisao|preso|delac|inquerito/, 'Investigações', 'Investigações, operações e o que cada lado diz.'],
  [/eleic|candidat|pesquisa eleitoral|urna|campanha eleitoral/, 'Eleições', 'Eleições: candidatos, pesquisas e regras.'],
  [/camara|senado|congresso|deputad|senador|\bpec\b|\bcpi\b|motta|alcolumbre|votac|projeto de lei/, 'Congresso', 'O que o Congresso está votando e como isso te afeta.'],
  [/inflac|dolar|juros|selic|imposto|gasolina|combustiv|salario|economia|\bpib\b|divida|orcamento|desonerac|fertiliz|agro|bndes|bolsa familia|aposentad|inss|imposto de renda|preco/, 'Economia e Seu Bolso', 'Economia explicada: o que muda no seu bolso.'],
  [/trump|\beua\b|estados unidos|china|russia|argentina|milei|paraguai|venezuela|maduro|\bcop\s?3|iran|israel|ucrania|europa|mundial|papa/, 'Política Mundial', 'O que acontece no mundo e como isso chega ao Brasil.'],
];

/** { titulo, descricao } da playlist do assunto, ou null. */
export function playlistDoAssunto(item) {
  const texto = sem(`${item.roteiro?.titulo || item.titulo || ''} ${item.tema || ''}`);
  const regras = item.games ? GAMES : item.politica ? POLITICA : null;
  if (item.brasil) return { titulo: 'Brasil Inacreditável — Histórias Reais', descricao: 'Histórias reais e mistérios do Brasil.' };
  if (!regras) return null;
  for (const [re, titulo, descricao] of regras) if (re.test(texto)) return { titulo, descricao };
  return item.games ? { titulo: 'Notícias de Games', descricao: 'As notícias do mundo dos games, todo dia.' } : { titulo: 'Política Hoje', descricao: 'As notícias de política do dia, explicadas sem torcida.' };
}

export const _regras = { GAMES, POLITICA };
