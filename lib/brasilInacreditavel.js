// Canal "Brasil Inacreditável": histórias reais do Brasil que parecem mentira (mistérios, sobreviventes,
// lugares proibidos, cidades que sumiram, crimes e golpes famosos). Ritmo rápido, vídeos de 15 a 18 min
// e um Short de cada história. Substitui o antigo canal "Aqui Tem Música".
//
// Como funciona (tudo sozinho; o dono só aprova o vídeo PRONTO na aba ✅ Aprovar do Compilador):
//   1. Pega a próxima pauta do banco (PAUTAS) que ainda não virou vídeo.
//   2. O Claude PESQUISA na web (várias fontes) e escreve o roteiro SÓ com o que encontrou.
//   3. Revisão de ortografia em todas as frases, título e capa.
//   4. O roteiro vai para a Fábrica com o motor dos documentários (fotos reais da Wikimedia, vídeos reais,
//      ilustração só onde não existe foto) e o vídeo pronto espera a aprovação antes do YouTube.
//
// Regras do canal: nada inventado (sobrevivente, fala, número, nome). Onde as fontes divergem, "mais de" ou as
// duas versões. Lenda é chamada de lenda. Tragédia com respeito (sem sangue, sem deboche), o que também
// protege a monetização. Joelma e Césio-137 já saíram no Noites na História: não entram aqui.

import { claudeComBusca } from './gamesDicas';
import { CLAUDE_URL, modeloClaude } from './textoNoClaude';
import { revisarOrtografia } from './politicaNoticias';

export const COLECAO_BRASIL = 'youvideo_brasil_inacreditavel';
export const CONFIG_BRASIL = 'brasil_inacreditavel'; // youvideo_config/brasil_inacreditavel
export const NOME_CANAL = 'Brasil Inacreditável';

const MUSICA = 'Mysterious cinematic documentary underscore, low strings and soft pulsing synth, suspenseful but calm, steady, no loud hits';
const RODAPE = '🇧🇷 Brasil Inacreditável — histórias reais do Brasil que parecem mentira. Novos vídeos toda segunda, quarta e sexta.';
const CREDITO = '📷 Fotos de acervos públicos (Wikimedia Commons) e vídeos de bancos livres. Algumas cenas são ilustrações criadas para reconstituir momentos sem registro. Narração com voz sintética.';

// Banco de pautas (conferidas em pelo menos duas fontes; o Claude pesquisa de novo antes de escrever).
// "fatos" = pontos de partida já conferidos; o roteiro aprofunda com a pesquisa.
export const PAUTAS = [
  { id: 'misterios-do-brasil', titulo: '10 Mistérios do Brasil que Ninguém Conseguiu Explicar', lista: true,
    fatos: 'Um caso por capítulo, do menos para o mais impressionante: Máscaras de Chumbo (Niterói, 1966); Operação Prato (Colares, PA, 1977-1978); Airão Velho e a lenda das formigas de fogo (AM); Percy Fawcett e a Cidade Perdida de Z (MT, 1925); Ilha da Queimada Grande (SP); Pedra do Ingá (PB); foto do disco voador da Ilha da Trindade (1958, apontada como fraude e ainda debatida); ET de Varginha (MG, 1996); o Encouraçado São Paulo que sumiu no Atlântico (1951); Serra da Capivara e a chegada do homem às Américas (PI).' },
  { id: 'atafona', titulo: 'Atafona: A Cidade Brasileira que o Mar Está Engolindo',
    fatos: 'Distrito de São João da Barra (RJ). Erosão registrada desde os anos 1950; o mar destruiu mais de 500 construções e cerca de 14 quarteirões, incluindo farol, escola, igrejas e um hotel. Causa principal apontada: menos areia trazida pelo Rio Paraíba do Sul (barragens), somada ao avanço do mar.' },
  { id: 'varig-254', titulo: 'O Avião que Se Perdeu por Causa de Um Número e Caiu na Amazônia',
    fatos: 'Voo Varig 254, 3 de setembro de 1989, Boeing 737-200 PP-VMK, trecho Marabá-Belém. O rumo foi inserido como 270 em vez de 027; o avião voou para oeste, ficou sem combustível e pousou na mata no norte de Mato Grosso. 54 a bordo: 12 mortos e 42 sobreviventes (algumas fontes citam 13 mortos). Quatro sobreviventes andaram pela selva para buscar socorro; resgate cerca de dois dias depois. Levou a mudanças como o CRM na aviação.' },
  { id: 'queimada-grande', titulo: 'Ilha da Queimada Grande: A Ilha das Cobras Onde é Proibido Pisar',
    fatos: 'A cerca de 35 km do litoral sul de SP (entre Itanhaém e Peruíbe). Único habitat da jararaca-ilhoa (Bothrops insularis), criticamente ameaçada. Desembarque só para pesquisadores autorizados (ICMBio/Marinha). Farol automatizado; estimativas de população de cobras variam entre fontes. Instituto Butantan estuda a ilha.' },
  { id: 'banco-central-fortaleza', titulo: 'O Túnel de 80 Metros Até o Cofre do Banco Central',
    fatos: 'Fortaleza, madrugada de 6 de agosto de 2005 (descoberto em 8 de agosto). Quadrilha alugou casa vizinha em abril de 2005, montou fachada de empresa de grama sintética e cavou túnel de cerca de 75 a 80 metros. Levou cerca de R$ 164,7 milhões em notas de R$ 50 usadas (mais de três toneladas). Só cerca de 15% foi recuperado. Crime: tratar como crime, sem glamourizar.' },
  { id: 'mascaras-de-chumbo', titulo: 'O Caso das Máscaras de Chumbo: Dois Homens, Um Bilhete e Nenhuma Resposta',
    fatos: '20 de agosto de 1966, Morro do Vintém, Niterói (RJ). Um jovem soltando pipa achou os corpos de Manoel Pereira da Cruz e Miguel José Viana, técnicos em eletrônica, com capas de chuva, máscaras de chumbo e um bilhete cifrado. Sem sinais de violência; a causa da morte nunca foi determinada. Hipóteses: contato com extraterrestres, ritual espiritualista, envenenamento.' },
  { id: 'fordlandia', titulo: 'Fordlândia: A Cidade Americana que Henry Ford Ergueu na Amazônia',
    fatos: 'Fundada em 1928 às margens do Rio Tapajós, município de Aveiro (PA), para produzir borracha. Casas no estilo americano, regras rígidas, revolta de trabalhadores em 1930, pragas nas seringueiras. Henry Ford nunca visitou. Em 1945, o neto Henry Ford II encerrou e vendeu ao governo brasileiro. Hoje é distrito habitado com ruínas.' },
  { id: 'maceio-afundando', titulo: 'Maceió: Os Bairros que Afundaram Debaixo dos Pés dos Moradores',
    fatos: 'Em 3 de março de 2018, tremor no bairro do Pinheiro. Afundamento ligado à mineração de sal-gema da Braskem por cerca de 40 anos. Cinco bairros: Pinheiro, Mutange, Bebedouro, Bom Parto e Farol. Cerca de 60 mil pessoas deixaram suas casas. Mina 18 em alerta em 2023. Acordo de R$ 1,7 bilhão com a prefeitura (2023). Tratar a empresa conforme as fontes (acordos, responsabilização), sem acusar além do que elas dizem.' },
  { id: 'airao-velho', titulo: 'Airão Velho: A Cidade Abandonada no Meio da Floresta e o Japonês que Cuida Dela',
    fatos: 'Fundada em 1694 no Rio Negro (AM), prosperou no ciclo da borracha e foi esvaziada; o último morador saiu em 1985; a Marinha usou como alvo de treino até 2005, quando o Iphan tombou. Lenda das formigas de fogo (sem comprovação). Shigeru Nakayama chegou em 2001 e passou a cuidar das ruínas, a pedido da última herdeira.' },
  { id: 'ilha-anchieta', titulo: 'A Rebelião na "Alcatraz Brasileira": A Fuga da Ilha Anchieta',
    fatos: '20 de junho de 1952, Instituto Correcional da Ilha Anchieta, Ubatuba (SP), a cerca de 700 metros do continente. Mais de 100 presos dominaram a guarda, queimaram prontuários e fugiram em lanchas e canoas; a maioria foi recapturada. Número de mortos varia entre fontes. Primeira grande fuga em massa de um presídio brasileiro; o presídio fechou em 1955.' },
  { id: 'percy-fawcett', titulo: 'Percy Fawcett: O Explorador que Sumiu Procurando a Cidade Perdida de Z',
    fatos: 'Britânico, partiu de Cuiabá em 20 de abril de 1925 com o filho Jack e Raleigh Rimell, atrás da cidade que chamou de Z (inspirada no Manuscrito 512 da Biblioteca Nacional). Desapareceram no Mato Grosso; última notícia em 29 de maio de 1925. Nunca foram encontrados; houve achados e farsas depois (teodolito em 1933, ossos que não eram dele). Pesquisas recentes acharam grandes povoados antigos no Xingu.' },
  { id: 'canudos-submersa', titulo: 'Canudos: A Cidade Destruída na Guerra e Afogada por uma Represa',
    fatos: 'Guerra de Canudos (1896-1897), Bahia. As ruínas ficaram sob o Açude Cocorobó, construído pelo DNOCS e concluído em 1969. Em secas fortes, como em 2013, partes da antiga igreja reaparecem. Parque Estadual de Canudos preserva a memória.' },
  { id: 'principe-de-asturias', titulo: 'Príncipe de Astúrias: O "Titanic Brasileiro" e o Ouro Perdido',
    fatos: 'Transatlântico espanhol que afundou na Ponta da Pirabura, Ilhabela (SP), na madrugada de 5 de março de 1916. Oficialmente 445 mortos (outras fontes citam 477). Lenda de 11 toneladas de ouro a bordo, sem documentos que comprovem. Peças no museu náutico de Ilhabela.' },
  { id: 'operacao-prato', titulo: 'Operação Prato: Quando a Força Aérea Foi Investigar Luzes na Amazônia',
    fatos: 'Entre 1977 e 1978, a FAB investigou relatos de luzes que atacavam moradores em Colares (PA), o "chupa-chupa". Comandada pelo capitão Uyrangê Hollanda. Parte dos documentos está no Arquivo Nacional. Apresentar os relatos como relatos e as explicações possíveis, sem afirmar que eram extraterrestres.' },
  { id: 'gran-circo', titulo: 'O Incêndio do Gran Circo Norte-Americano: A Maior Tragédia do Brasil',
    fatos: 'Niterói, 17 de dezembro de 1961: incêndio criminoso durante matinê com cerca de 3 mil pessoas. 503 mortos, a maioria crianças. A trapezista deu o alerta; o fogo consumiu a lona em poucos minutos. Mutirão de médicos (Ivo Pitanguy); José Datrino, depois conhecido como Profeta Gentileza, começou ali sua missão. Muito respeito: nada de detalhes de vítimas.' },
  { id: 'pedra-do-inga', titulo: 'Pedra do Ingá: As Inscrições que Ninguém Consegue Decifrar',
    fatos: 'Ingá (PB), a cerca de 40 km de Campina Grande. Painel de gravuras na rocha com registro desde 1598; tombado pelo Iphan em 1944. Teorias de fenícios, calendário solar e extraterrestres; arqueólogos atribuem a povos indígenas antigos, gravado ao longo de muito tempo.' },
  { id: 'bendego', titulo: 'Bendegó: A Pedra que Caiu do Céu e Sobreviveu ao Incêndio do Museu Nacional',
    fatos: 'Meteorito de cerca de 5,36 toneladas achado em 1784 em Monte Santo (BA). Primeira tentativa de transporte falhou (caiu num riacho). Levado ao Rio entre 1887 e 1888, sob Dom Pedro II; José Carlos de Carvalho virou Barão de Bendegó. Saiu intacto do incêndio do Museu Nacional em 2 de setembro de 2018.' },
  { id: 'ilha-da-trindade', titulo: 'A Foto do Disco Voador na Ilha da Trindade: Verdade ou Farsa?',
    fatos: '16 de janeiro de 1958, navio Almirante Saldanha, da Marinha, na Ilha da Trindade. O fotógrafo Almiro Baraúna fez quatro fotos de um objeto; jornais publicaram em fevereiro de 1958. Investigações (incluindo arquivos do Projeto Blue Book) apontaram fraude, e um sobrinho disse que Baraúna admitiu a montagem; o caso segue debatido. Mostrar os dois lados.' },
  { id: 'et-de-varginha', titulo: 'ET de Varginha: O Que Aconteceu de Verdade em 1996',
    fatos: '20 de janeiro de 1996, Varginha (MG): três jovens disseram ter visto uma criatura num terreno baldio. Autoridades negaram captura; documentos do STM e do Exército foram divulgados depois. Memorial do ET inaugurado em 2022 e série da Globo em 2026. Apresentar relatos e versões oficiais, sem afirmar o que não foi provado.' },
  { id: 'encouracado-sao-paulo', titulo: 'O Encouraçado que Sumiu no Oceano com Oito Homens a Bordo',
    fatos: 'Encouraçado São Paulo, lançado em 1909 na Inglaterra, um dos maiores dreadnoughts da época. Vendido como sucata a um estaleiro britânico em 1951; no reboque, uma tempestade rompeu os cabos ao norte dos Açores em novembro de 1951. Oito tripulantes a bordo nunca foram achados; o navio nunca foi localizado.' },
  { id: 'serra-da-capivara', titulo: 'Serra da Capivara: O Lugar que Pode Mudar a História do Homem nas Américas',
    fatos: 'Parque Nacional no Piauí, Patrimônio da Unesco desde 1991. Pinturas rupestres com mais de 25 mil anos (segundo a Unesco). Vestígios na Toca do Boqueirão da Pedra Furada datados em dezenas de milhares de anos (citações entre 48 mil e 60 mil), o que ainda gera debate. Niède Guidon liderou as pesquisas.' },
  { id: 'barbacena', titulo: 'Hospital Colônia de Barbacena: O "Holocausto Brasileiro"',
    fatos: 'Barbacena (MG), fundado em 1903. Cerca de 60 mil mortes ao longo do século XX; segundo o livro de Daniela Arbex (2013), cerca de 70% dos internos não tinham diagnóstico. Fotos de Luiz Alfredo na revista O Cruzeiro (1961). Corpos vendidos a faculdades de medicina. Tema pesado: tom respeitoso e sem imagens chocantes.' },
  { id: 'serra-pelada', titulo: 'Serra Pelada: O Formigueiro Humano em Busca de Ouro',
    fatos: 'Curionópolis (PA). Garimpo começou em 1980 na Fazenda Três Barras; maior garimpo a céu aberto do mundo, com mais de 100 mil garimpeiros. Mais de 42 toneladas de ouro em uma década; auge em 1983. Fotos famosas de Sebastião Salgado. Desmoronamentos mataram garimpeiros. Fechado oficialmente em 1992.' },
  { id: 'u-507', titulo: 'O Submarino Nazista que Afundou Seis Navios na Costa do Brasil',
    fatos: 'Agosto de 1942: o submarino alemão U-507, comandado por Harro Schacht, afundou seis navios brasileiros entre Sergipe e Bahia (Baependy, Araraquara, Aníbal Benévolo, Itagiba, Arará e Jacira), com mais de 600 mortos. Levou o Brasil a declarar guerra ao Eixo. Contar pelo lado dos passageiros e da costa (outro canal já fez o básico).' },
  { id: 'gol-1907', titulo: 'A Colisão no Céu da Amazônia: O Voo 1907 da Gol',
    fatos: '29 de setembro de 2006: o Boeing 737-800 do voo 1907 (Manaus-Brasília-Rio) e um jato Embraer Legacy 600 se chocaram a 37 mil pés sobre o norte de Mato Grosso. As 154 pessoas do Boeing morreram; o Legacy pousou com os 7 ocupantes ilesos. Transponder e anticolisão do Legacy estavam desligados; falhas do controle de tráfego. Pilotos condenados. Muito respeito com as vítimas.' },
  { id: 'igatu', titulo: 'Igatu: A "Machu Picchu Baiana" Construída por Garimpeiros',
    fatos: 'Distrito de Andaraí, Chapada Diamantina (BA). Vila de pedra do garimpo de diamantes do século XIX; já teve milhares de moradores (fontes citam de 9 a 10 mil) e hoje tem cerca de 400. Tombada pelo Iphan em 2000 (cerca de 200 imóveis e as ruínas).' },
  { id: 'andraus', titulo: 'O Incêndio do Edifício Andraus: As Pessoas Salvas Pelo Heliponto',
    fatos: '24 de fevereiro de 1972, centro de São Paulo: sobrecarga elétrica incendiou o prédio. 16 mortos (uma fonte cita 17) e mais de 300 feridos. Pesquisar como o heliponto e os helicópteros ajudaram no resgate. Foi dois anos antes do Joelma (não detalhar o Joelma, que já saiu no Noites na História).' },
];

export const pautaPorId = (id) => PAUTAS.find((p) => p.id === id) || null;

const PREFIXOS = /^(foto|v[íi]deo atual|v[íi]deo|ilustra[çc][ãa]o):/i;
const limparFrase = (t) => String(t || '').replace(/[぀-ヿ㐀-鿿가-힯]+/g, '').replace(/\s+/g, ' ').trim();

/** Cenas do JSON -> texto no formato dos episódios (lib/documentario.js): "# capítulo", "@ mídia | quadrinho", narração. */
function textoDasCenas(cenas, capitulo = '') {
  const linhas = capitulo ? [`# ${capitulo}`] : [];
  for (const c of cenas || []) {
    const texto = limparFrase(c.texto);
    if (!texto) continue;
    let midia = String(c.midia || '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
    if (!midia) midia = 'vídeo atual: brazil aerial landscape';
    else if (!PREFIXOS.test(midia)) midia = `foto: ${midia}`;
    const local = c.local && c.local.titulo ? ` | ${String(c.local.titulo).replace(/\|/g, ' ').slice(0, 40)} | ${String(c.local.texto || '').replace(/\|/g, ' ').slice(0, 90)}` : '';
    linhas.push(`@ ${midia}${local}`, texto);
  }
  return linhas.join('\n');
}

const hashtagsDe = (tags) =>
  (tags || []).slice(0, 4).map((t) => '#' + String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2).join(' ');

/** Revisão de ortografia de todas as frases narradas, do título, da capa e da descrição (no lugar). */
async function revisarTudo(j) {
  const grupos = [j.abertura, ...(j.blocos || []).map((b) => b.cenas), j.final].filter(Array.isArray);
  const refs = [];
  for (const g of grupos) for (const c of g) if (c && typeof c.texto === 'string') refs.push([c, 'texto']);
  for (const b of j.blocos || []) if (typeof b.capitulo === 'string') refs.push([b, 'capitulo']);
  for (const k of ['titulo', 'thumb', 'thumbSub', 'descricao']) if (typeof j[k] === 'string') refs.push([j, k]);
  // Em lotes (o revisor responde melhor com listas menores)
  for (let i = 0; i < refs.length; i += 40) {
    const lote = refs.slice(i, i + 40);
    const novos = await revisarOrtografia(lote.map(([o, k]) => o[k]));
    lote.forEach(([o, k], n) => (o[k] = novos[n]));
  }
  return j;
}

const REGRAS =
  'REGRAS DO CANAL (obrigatórias): ' +
  '1) ANTES de escrever, pesquise na web em pelo menos 3 fontes confiáveis (grandes jornais, sites oficiais, universidades, museus; Wikipédia só como ponto de partida) e use SÓ o que encontrou. ' +
  'Nunca invente sobrevivente, diálogo, fala entre aspas, nome, data ou número. Quando as fontes divergem num número, use "mais de" ou diga as duas versões. Lenda é chamada de lenda; hipótese é chamada de hipótese. ' +
  '2) Tragédia com respeito: nada de detalhe de corpos, sangue ou sofrimento explícito, nada de deboche. Crime é tratado como crime, sem glamourizar. Quem não foi condenado é "suspeito" ou "acusado". ' +
  '3) Português do Brasil impecável (ortografia, acentos, crase, concordância). Tom de narrador de história de mistério: envolvente, frases curtas, sem gíria e sem palavrão. ' +
  'Na narração, números e datas por extenso (ex.: "três de setembro de mil novecentos e oitenta e nove"); no título e na capa, com algarismos. Não copie frases das fontes: reescreva com suas palavras. ' +
  '4) PRENDER ATÉ O FIM: a 1ª frase é o momento mais impressionante da história (sem "olá", sem apresentar o canal). A 2ª abre uma pergunta que só se responde no final. ' +
  'Cada capítulo termina com um gancho para o próximo. Uma frase curta pedindo inscrição depois do 2º capítulo. ' +
  '5) Cada cena tem 1 a 3 frases e "midia", que MOSTRA o que a frase fala. Opções: ' +
  '"foto: <termos de busca em inglês do lugar, objeto ou fato real, ex.: Fordlandia water tower Brazil>" para foto real de arquivo (prefira esta); ' +
  '"vídeo atual: <termos em inglês>" para o lugar como é hoje ou paisagem; ' +
  '"ilustração: <descrição em inglês da cena da época, estilo foto realista colorida, sem sangue, sem texto, sem rosto de pessoa famosa real>" só para momentos que não têm foto. ' +
  'Opcional "local": {"titulo":"até 40 caracteres","texto":"até 90 caracteres"} para um quadrinho com o nome do lugar e a data, na primeira cena de cada lugar novo.';

const JSON_CENA = '{"midia":"foto: ... | vídeo atual: ... | ilustração: ...","texto":"...","local":{"titulo":"...","texto":"..."}}';

/**
 * ETAPA 1 — pesquisa (resposta pequena, cabe sempre): o Claude procura na web e devolve só os fatos conferidos.
 * Antes a pesquisa e o roteiro saíam juntos e o roteiro longo era cortado no meio ("roteiro curto demais").
 */
export async function pesquisarBrasil(pauta) {
  const { json, fontes } = await claudeComBusca(
    'Você é pesquisador do canal brasileiro "Brasil Inacreditável" (histórias reais do Brasil). Pesquise na web, em pelo menos 3 fontes confiáveis ' +
      '(grandes jornais, sites oficiais, universidades, museus; Wikipédia só como ponto de partida), a história pedida. NÃO escreva roteiro. ' +
      'No final da sua resposta, coloque SÓ um JSON (sem texto depois) assim: ' +
      '{"fatos":["25 a 40 fatos em português, cada um com a data, o número ou o nome EXATAMENTE como está na fonte e o nome da fonte entre parênteses, na ordem em que aconteceram"],' +
      '"divergencias":["onde as fontes discordam (ex.: número de mortos), com as versões"],"lendas":["o que é lenda ou hipótese, e não fato"],' +
      '"epoca":"lugar e época principal, ex.: Pará, Brasil, anos 1920","capa":"termos em inglês para a foto real da capa",' +
      '"imagens":["8 a 15 termos de busca em inglês de lugares, objetos e fatos reais da história que devem ter foto de arquivo"]}',
    `História: ${pauta.titulo}\nPontos de partida já conferidos (confirme e aprofunde): ${pauta.fatos}\nData de hoje: ${new Date().toISOString().slice(0, 10)}`
  );
  if (!Array.isArray(json?.fatos) || json.fatos.length < 6) throw new Error('A pesquisa voltou com poucos fatos. Vai tentar de novo.');
  return { pesquisa: json, fontes };
}

/** Lê o JSON da resposta do Claude (com ou sem ```json). */
function jsonDaResposta(texto) {
  const t = String(texto || '').replace(/```(?:json)?/gi, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try {
    return JSON.parse(t.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

/** ETAPA 2 — escreve o roteiro SÓ com a pesquisa (sem busca: sobra espaço e tempo para o vídeo longo inteiro). */
export async function escreverBrasil(pauta, formato, pesquisa, fontes = []) {
  const longo = formato !== 'short';
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('Falta a ANTHROPIC_API_KEY na Vercel.');
  const tamanho = longo
    ? pauta.lista
      ? 'Vídeo longo em LISTA: abertura de 3 a 4 cenas com o gancho; um bloco por caso (10 blocos, do 10º lugar ao 1º, "capitulo" = "10. Nome do caso"), cada um com 5 a 8 cenas; final com o resumo, uma pergunta para os comentários ("qual desses mistérios você acha que tem explicação?") e o convite para se inscrever. Total de 2200 a 2700 palavras.'
      : 'Vídeo longo: abertura de 3 a 4 cenas com o gancho; 5 a 7 blocos em ordem (o lugar e a época, o que aconteceu passo a passo, as pessoas envolvidas, as explicações e o que as fontes dizem, o que existe hoje), cada um com 8 a 14 cenas; final com o desfecho, uma pergunta para os comentários e o convite para se inscrever. Total de 2000 a 2600 palavras.'
    : 'Short vertical: 1 bloco de 9 a 11 cenas curtas, de 140 a 170 palavras no total (55 a 70 segundos): a 1ª frase é o fato mais impressionante, depois o essencial da história, e a última cena diz "A história completa está no canal Brasil Inacreditável." Sem "local".';
  const sistema =
    'Você escreve vídeos do canal brasileiro "Brasil Inacreditável": histórias REAIS do Brasil que parecem mentira. ' +
    REGRAS.replace(/1\) ANTES de escrever, pesquise[^.]*\./, '1) Use SÓ os fatos da PESQUISA que vem no pedido.') +
    ' Responda SÓ com um JSON válido (sem texto antes ou depois, sem ```) assim: ' +
    '{"titulo":"até 90 caracteres, curiosidade forte que o vídeo entrega, sem mentir e sem clickbait vazio","thumb":"2 a 4 palavras em CAIXA ALTA para a capa","thumbSub":"lugar e ano, até 3 palavras (ex.: PARÁ, 1928)",' +
    `"abertura":[${JSON_CENA}],"blocos":[{"capitulo":"nome curto","cenas":[${JSON_CENA}]}],"final":[${JSON_CENA}],` +
    '"descricao":"2 parágrafos curtos para o YouTube: do que trata o vídeo, sem entregar o final","tags":["10 a 14 tags em português"]}. ' +
    tamanho;
  const pedido =
    `História: ${pauta.titulo}\n\nPESQUISA (fatos conferidos nas fontes):\n${JSON.stringify(pesquisa).slice(0, 30000)}\n\n` +
    (fontes.length ? `Fontes: ${fontes.slice(0, 10).map((f) => f.titulo).join(' | ')}\n` : '') +
    'Para as fotos, aproveite os termos da lista "imagens" da pesquisa.';
  const r = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(270000),
    body: JSON.stringify({ model: modeloClaude(), max_tokens: longo ? 24000 : 6000, system: sistema, messages: [{ role: 'user', content: pedido }] }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error?.message || `Claude respondeu ${r.status}`);
  if (d.stop_reason === 'max_tokens') throw new Error('O roteiro ficou grande demais e foi cortado. Vai tentar de novo.');
  const j = jsonDaResposta((d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'));
  if (!j || !Array.isArray(j.blocos)) throw new Error('O roteiro não veio no formato certo. Vai tentar de novo.');
  j.epoca = pesquisa.epoca;
  j.capa = pesquisa.capa;
  j.fatos = pesquisa.fatos;
  return montarEp(pauta, formato, await revisarTudo(j), fontes);
}

/** Pesquisa e escreve de uma vez (as duas etapas seguidas). */
export async function roteiroBrasil(pauta, formato = 'longo') {
  const { pesquisa, fontes } = await pesquisarBrasil(pauta);
  return escreverBrasil(pauta, formato, pesquisa, fontes);
}

/** JSON do roteiro -> episódio no formato dos documentários (lib/documentario.js), pronto para roteiroDoEpisodio(). */
function montarEp(pauta, formato, j, fontes) {
  const longo = formato !== 'short';
  const partes = longo ? [textoDasCenas(j.abertura, 'Abertura')] : [textoDasCenas(j.abertura)];
  for (const b of j.blocos || []) partes.push(textoDasCenas(b.cenas, longo ? String(b.capitulo || '').slice(0, 60) : ''));
  partes.push(textoDasCenas(j.final, longo ? 'Final' : ''));
  const texto = partes.filter(Boolean).join('\n\n');
  const cenas = (texto.match(/^@ /gm) || []).length;
  if (cenas < (longo ? 20 : 6)) throw new Error(`O roteiro veio curto demais (${cenas} cenas). Vai tentar de novo.`);
  const tags = (j.tags || []).map(String).slice(0, 14);
  const titulo = String(j.titulo || pauta.titulo).slice(0, 100);
  const ep = {
    id: `bi-${pauta.id}-${longo ? 'longo' : 'short'}-${Date.now().toString(36)}`,
    serie: NOME_CANAL,
    titulo,
    thumb: String(j.thumb || '').toUpperCase().slice(0, 40),
    thumbSub: String(j.thumbSub || '').toUpperCase().slice(0, 30),
    capa: `foto: ${String(j.capa || pauta.titulo).replace(PREFIXOS, '').trim().slice(0, 120)}`,
    epoca: String(j.epoca || 'Brasil').slice(0, 120),
    ritmo: 'documentario',
    cauda: false,
    musica: MUSICA,
    descricao: [
      titulo,
      String(j.descricao || '').trim(),
      fontes.length ? 'Fontes consultadas:\n' + fontes.slice(0, 10).map((f) => `• ${f.titulo}: ${f.url}`).join('\n') : '',
      RODAPE,
      CREDITO,
      longo ? '🔔 Inscreva-se e ative o sininho para não perder a próxima história.\n💬 Conte nos comentários: você já conhecia esse caso?' : '',
      `${hashtagsDe(tags)} #brasilinacreditavel #historiasreais${longo ? '' : ' #shorts'}`,
    ].filter(Boolean).join('\n\n').slice(0, 4900),
    tags: [...new Set([...tags, 'brasil inacreditável', 'histórias reais', 'mistérios do brasil', 'curiosidades do brasil'])].slice(0, 18),
    ...(longo ? { playlist: { titulo: 'Histórias Reais do Brasil', descricao: 'Mistérios, sobreviventes, lugares proibidos e cidades que sumiram. Histórias reais do Brasil que parecem mentira.' } } : {}),
    texto,
    fatos: (Array.isArray(j.fatos) ? j.fatos : []).map((f) => String(f).slice(0, 300)).slice(0, 40),
  };
  return { ep, fontes };
}

// ───────────────────────── Agenda ─────────────────────────
// Longos: segunda, quarta e sexta às 19h (Brasília). Shorts: um por dia às 12h30.
// O vídeo é produzido logo e fica esperando a sua aprovação; o horário é o de ir ao ar no YouTube.

const BRASILIA = 3 * 3600e3;
const DIAS_LONGO = [1, 3, 5];

function horarioBrasilia(diaUtc, h, m) {
  const d = new Date(diaUtc);
  d.setUTCHours(h, m, 0, 0);
  return d.getTime() + BRASILIA; // h:m em Brasília -> UTC
}

/** Próximo horário livre para um vídeo do canal (ocupados = horários já marcados, em ms). */
export function proximoHorarioBrasil(ocupados, formato, agora = Date.now()) {
  const longo = formato !== 'short';
  const minimo = agora + (longo ? 30 : 8) * 3600e3; // tempo para produzir e você aprovar
  const dia0 = new Date(agora - BRASILIA);
  dia0.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 120; i++) {
    const dia = new Date(dia0.getTime() + i * 86400e3);
    if (longo && !DIAS_LONGO.includes(dia.getUTCDay())) continue;
    const t = longo ? horarioBrasilia(dia, 19, 0) : horarioBrasilia(dia, 12, 30);
    if (t < minimo) continue;
    if (ocupados.some((o) => Math.abs(o - t) < 3600e3)) continue;
    return new Date(t).toISOString();
  }
  return new Date(minimo).toISOString();
}
