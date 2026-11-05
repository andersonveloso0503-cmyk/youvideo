// Notícia de OUTRO país: a imagem de reserva é daquele país (antes era sempre Brasília — Short do Paraguai
// mostrava a Esplanada enquanto falava de Assunção). Ordem importa: o primeiro que aparecer no texto vale.
const LUGARES = [
  [/paragua|assun[cç][aã]o|pe[ñn]a\b/i, ['asuncion paraguay city', 'paraguay flag waving'], ['Asunción', 'Flag of Paraguay']],
  [/argentin|buenos aires|milei/i, ['buenos aires city', 'argentina flag waving'], ['Casa Rosada', 'Flag of Argentina']],
  [/venezuel|caracas|maduro/i, ['caracas venezuela city', 'venezuela flag waving'], ['Caracas', 'Flag of Venezuela']],
  [/bol[ií]via|la paz\b/i, ['la paz bolivia city', 'bolivia flag waving'], ['La Paz Bolivia', 'Flag of Bolivia']],
  [/\bchile|santiago do chile/i, ['santiago chile city', 'chile flag waving'], ['Santiago de Chile', 'Flag of Chile']],
  [/uruguai|montevid/i, ['montevideo uruguay city', 'uruguay flag waving'], ['Montevideo', 'Flag of Uruguay']],
  [/col[oô]mbia|bogot/i, ['bogota colombia city', 'colombia flag waving'], ['Bogotá', 'Flag of Colombia']],
  [/\beua\b|estados unidos|washington|casa branca|trump|democratas|republicanos|congresso americano/i, ['washington dc capitol building', 'american flag waving'], ['United States Capitol', 'White House']],
  [/israel|gaza|netanyahu|jerusal/i, ['jerusalem city', 'israel flag waving'], ['Jerusalem', 'Flag of Israel']],
  [/ucr[aâ]nia|zelensk|kiev|kyiv/i, ['kyiv ukraine city', 'ukraine flag waving'], ['Kyiv', 'Flag of Ukraine']],
  [/r[uú]ssia|putin|moscou|kremlin/i, ['moscow kremlin', 'russia flag waving'], ['Moscow Kremlin', 'Flag of Russia']],
  [/\bchina\b|pequim|xi jinping/i, ['beijing city', 'china flag waving'], ['Beijing', 'Flag of China']],
  [/uni[aã]o europeia|bruxelas|parlamento europeu/i, ['european union flags brussels', 'european union flag'], ['European Parliament Brussels', 'Flag of Europe']],
];
export function lugarDaNoticia(...textos) {
  for (const t of textos) {
    const x = String(t || '');
    if (!x) continue;
    const l = LUGARES.find(([re]) => re.test(x));
    if (l) return { buscas: l[1], fotos: l[2] };
  }
  return null;
}

