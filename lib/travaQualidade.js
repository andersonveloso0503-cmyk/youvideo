// TRAVA DE QUALIDADE (17/11, dono: "tem que valer para tudo. O que não tiver a ver com o vídeo nem sobe.
// Perdemos tempo, perdemos dinheiro. Notícia perfeita de política, games, notícia da cidade... senão ficar bom, nem sobe").
//
// Duas travas, para TODOS os canais:
//  1. ANTES de gastar crédito (roteiro pronto, antes de voz/imagem): sem imagem que mostre o assunto -> nem faz.
//  2. NA HORA DE SUBIR: vídeo cuja conferência final achou problema sério (imagem que não tem a ver, imagem repetida,
//     erro de texto, legenda, capa, fala fora do assunto, nota baixa) NÃO sobe — nem aprovando, nem "subir assim mesmo".

/** Cenas "@ midia" de um texto de episódio (formato da Fábrica). */
export function cenasDoTexto(texto) {
  const linhas = String(texto || '').split('\n');
  const cenas = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l.startsWith('@')) continue;
    const fala = String(linhas[i + 1] || '').trim();
    if (fala && !fala.startsWith('@') && !fala.startsWith('#')) cenas.push({ midia: l.slice(1).trim(), texto: fala });
  }
  return cenas;
}

/**
 * Trava 1 (política, notícia da cidade, explicadores): quantas cenas iam ficar com vídeo GENÉRICO de banco
 * ("vídeo atual:") em vez de foto real do assunto/da pessoa. Devolve o motivo para não fazer, ou ''.
 */
export function faltaImagemDoAssunto(cenas, { maxGenericas = 2 } = {}) {
  const lista = (cenas || []).filter((c) => String(c?.texto || '').trim());
  if (lista.length < 3) return 'Roteiro curto demais (menos de 3 cenas)';
  const genericas = lista.filter((c) => /^\s*v[íi]deo atual:/i.test(String(c.midia || '')) || !String(c.midia || '').trim()).length;
  if (genericas > Math.max(maxGenericas, Math.floor(lista.length / 3)))
    return `Pouca imagem do assunto: ${genericas} de ${lista.length} cenas iam ficar com vídeo genérico`;
  return '';
}

// Etapas da conferência final que NÃO deixam o vídeo subir (nem forçando)
const GRAVES = /^(texto|legenda|m[íi]dia das cenas|imagens das cenas|imagens repetidas|capa|roteiro|nota do v[íi]deo|confer[êe]ncia)/i;

/** Trava 2: problemas sérios da conferência final ([] = pode subir). */
// 18/11 (dono: "sim, acima de 6,5"): nos GAMES, imagem repetida e nota abaixo do padrão viram só AVISO quando a nota
// é 6,5 ou mais (o jogo tem poucas imagens oficiais; antes de 17/11 esses vídeos subiam e iam bem). Política continua igual.
export const NOTA_MIN_GAMES = 6.5;
export function problemasGraves(cf, item = null) {
  if (!cf || !cf.status) return [];
  if (cf.status === 'erro') return ['• Conferência: não conseguiu conferir o vídeo (peça para conferir de novo).'];
  return (cf.etapas || [])
    // 18/11: IA sem crédito não é vídeo ruim — só conta o que as conferências sem IA acharam (repetidas, áudio...)
    .filter((e) => e && e.ok === false && GRAVES.test(String(e.nome || '')) && !(cf.status === 'sem_credito' && /^Confer/i.test(String(e.nome || ''))))
    .filter((e) => !(item?.games && Number(cf.nota) >= NOTA_MIN_GAMES && /^(imagens repetidas|nota do v[íi]deo)/i.test(String(e.nome || ''))))
    .map((e) => `• ${e.nome}: ${String(e.detalhe || '').slice(0, 140)}`)
    .slice(0, 6);
}
