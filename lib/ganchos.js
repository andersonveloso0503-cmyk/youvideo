// Sorteia um jeito diferente de COMEÇAR a narração e de montar o TÍTULO a cada vídeo,
// para os vídeos não saírem todos iguais ("Você já se perguntou..." em todos).
const ABERTURAS = [
  'comece NO MEIO da ação, no momento mais tenso da história, descrevendo a cena em frases curtas (ex.: "O mar estava se abrindo. E atrás deles, o exército do Faraó.")',
  'comece com uma afirmação surpreendente ou um detalhe pouco conhecido da história (ex.: "Davi era o mais novo de oito irmãos — e ninguém apostava nele.")',
  'comece falando direto com quem assiste sobre um sentimento real, ligando com a história (ex.: "Se hoje você se sente esquecido, essa história é para você.")',
  'comece com uma frase curta e forte, de 3 a 6 palavras (ex.: "Ele tinha tudo. E perdeu.")',
  'comece com uma fala marcante do personagem, com suas próprias palavras, sem citar versículo literal (ex.: "— Senhor, eu não sei falar bem...")',
  'comece com um número ou detalhe concreto (ex.: "Quarenta dias no deserto. Sem pão, sem água.")',
  'comece com um contraste (ex.: "Todos riram dele. Até a primeira gota de chuva cair.")',
  'comece com um mistério e prometa a revelação no final (ex.: "O que aconteceu naquela noite mudou tudo — e quase ninguém conhece o final.")',
];

const TITULOS = [
  'pergunta provocativa no formato "Por Que [pergunta intrigante sobre a história]?" (ex.: "Por Que Deus Mandou Abraão Subir Aquele Monte?")',
  '"[Personagem] e [evento marcante] | [subtítulo emocional]" (ex.: "Jonas e a Baleia | A Fuga que Quase Custou Sua Vida")',
  'frase de impacto com a lição da história + o nome do personagem (ex.: "Deus Não Esqueceu de Você — A História de José")',
  'curiosidade ou revelação (ex.: "O Detalhe Que Quase Ninguém Percebe na História de Jonas")',
  'o momento mais tenso em poucas palavras (ex.: "O Dia em Que o Fogo Desceu do Céu")',
];

const PROIBIDAS = '"Você já se perguntou", "Você sabia", "Imagine", "Olá", "Nesta história"';

export function variacaoRoteiro() {
  const abertura = ABERTURAS[Math.floor(Math.random() * ABERTURAS.length)];
  const titulo = TITULOS[Math.floor(Math.random() * TITULOS.length)];
  return { abertura, titulo, proibidas: PROIBIDAS };
}
