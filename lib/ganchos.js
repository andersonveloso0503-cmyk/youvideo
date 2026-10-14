// Sorteia um jeito diferente de COMEÇAR a narração e de montar o TÍTULO a cada vídeo,
// para os vídeos não saírem todos iguais. Todos os modelos seguem o estilo "curiosidade/mistério":
// o título faz uma PERGUNTA ou promete um SEGREDO, e o vídeo só responde no final.
const ABERTURAS = [
  'comece NO MEIO da ação, no momento mais tenso, com frases curtas de cena (ex.: "Sexta-feira. Três da tarde. O céu de Jerusalém fica escuro como a noite.") e logo em seguida prometa um segredo que só será revelado no final',
  'comece com um detalhe estranho ou pouco conhecido que a maioria nunca ouviu na igreja (ex.: "Existe um versículo que quase nenhum pastor prega. Ele diz que, quando Jesus morreu, túmulos se abriram.")',
  'comece com uma frase curta e forte, de 3 a 6 palavras, e depois a pergunta central do vídeo (ex.: "Ele tinha tudo. E perdeu. Mas o que aconteceu depois ninguém esperava.")',
  'comece com a pergunta central do vídeo feita direto para quem assiste, e diga que a resposta está escondida na própria Bíblia (ex.: "Onde Jesus estava nos três dias em que seu corpo ficou no túmulo? A Bíblia deixa pistas.")',
  'comece com um número ou detalhe concreto que choca (ex.: "Quarenta dias. Sem comida. Sozinho no deserto.")',
  'comece com um contraste que gera curiosidade (ex.: "Os inimigos de Jesus lembraram da promessa dele. Os discípulos, não.")',
  'comece com o final em suspenso: diga o que aconteceu, mas não como (ex.: "No domingo de manhã, os soldados mais bem treinados de Roma estavam caídos no chão como mortos. O que eles viram?")',
];

const TITULOS = [
  'pergunta "O que aconteceu com/quando..." (ex.: "O que aconteceu com Jesus nos 3 dias dentro do túmulo?")',
  'segredo pouco conhecido (ex.: "O detalhe da multiplicação dos pães que quase ninguém percebe")',
  'pergunta "Onde/Por que/Quem..." sobre um mistério da história (ex.: "Por que Pedro negou Jesus 3 vezes naquela noite?")',
  'o que alguém viu, ouviu ou escondeu (ex.: "O que os soldados viram no túmulo e esconderam")',
  'o que Jesus/o personagem disse ou fez que quase ninguém entende (ex.: "A última frase de Jesus que quase ninguém entende")',
  'número + revelação (ex.: "6 horas na cruz: o que Jesus sentiu em cada uma delas")',
];

const PROIBIDAS = '"Você já se perguntou", "Você sabia", "Olá", "Nesta história", "Neste vídeo", "Seja bem-vindo"';

export function variacaoRoteiro() {
  const abertura = ABERTURAS[Math.floor(Math.random() * ABERTURAS.length)];
  const titulo = TITULOS[Math.floor(Math.random() * TITULOS.length)];
  return { abertura, titulo, proibidas: PROIBIDAS };
}

// Estrutura "mistério" usada em todos os roteiros de histórias: o vídeo abre uma pergunta
// no começo e só entrega a resposta no final, com revelações no meio pra segurar quem assiste.
export const ESTRUTURA_MISTERIO = `- ESTRUTURA "MISTÉRIO" (o canal precisa prender a atenção, não dar aula):
  a) O TÍTULO faz uma pergunta ou promete um segredo. A narração gira em torno de responder essa pergunta, e a resposta completa só vem no final.
  b) Nos primeiros 30 segundos: gancho forte + a pergunta central + uma promessa clara ("fica até o final, porque..."). Nada de apresentação.
  c) Organize o meio em 4 a 7 "revelações" curtas, cada uma com um detalhe surpreendente ou pouco conhecido do relato bíblico (contexto histórico, costumes da época, um versículo que quase ninguém comenta, uma ironia da história). Cada revelação termina puxando a próxima ("mas isso ainda não explica...", "e é aqui que a história fica estranha...").
  d) A cada 1-2 minutos, fale direto com quem assiste ("pensa comigo", "repara nesse detalhe", "imagina você ali").
  e) Quando houver interpretações diferentes entre as igrejas, apresente-as com respeito e peça a opinião nos comentários (isso gera engajamento). Nunca invente fatos: tudo precisa estar na Bíblia ou ser contexto histórico conhecido.
  f) No final: responda a pergunta do título, traga uma aplicação emocional para a vida de quem assiste (1-3 frases) e anuncie o tema do próximo vídeo como um novo mistério.`;

export const THUMB_TITULO =
  'de 2 a 4 palavras, em forma de PERGUNTA curta ou frase de choque ligada ao mistério do título, pra aparecer BEM GRANDE na thumbnail (ex: \'ONDE ELE ESTAVA?\', \'3 DIAS DE SILÊNCIO\', \'ELE NEGOU 3 VEZES\', \'O QUE ELES VIRAM?\'), em maiúsculas, em português. Não use só o nome do personagem';

export const THUMB_SUBTITULO =
  'deixe como texto vazio na maioria das vezes — thumbnail com uma frase só chama mais atenção. Só preencha (até 4 palavras, maiúsculas) se for essencial';

export function instrucaoVideoLongo(palavrasAlvo, duracaoMin) {
  return `Formato vídeo longo: a narração precisa ter aproximadamente ${palavrasAlvo} palavras (pra durar bem perto de ${duracaoMin}min ao ser falada). Não encurte: desenvolva cada revelação com contexto histórico, detalhes do relato e reflexão, mantendo frases curtas e ritmo de suspense.`;
}
