// Livros bíblicos (para vender como PLR): histórias prontas, estilos de ilustração e os pedidos para a IA.
// O texto é sempre original (contado com palavras próprias), fiel ao relato bíblico.

export const HISTORIAS = [
  'A criação do mundo', 'Adão e Eva no jardim', 'Noé e a arca', 'A torre de Babel', 'Abraão e a promessa das estrelas',
  'José e a túnica colorida', 'Moisés no cestinho', 'Moisés e o mar que se abriu', 'Josué e as muralhas de Jericó', 'Sansão, o homem forte',
  'Rute e Noemi', 'Samuel ouve a voz de Deus', 'Davi e Golias', 'Elias e o fogo no monte Carmelo', 'Jonas e o grande peixe',
  'Daniel na cova dos leões', 'Os três amigos na fornalha', 'A rainha Ester', 'O nascimento de Jesus', 'Jesus acalma a tempestade',
  'A multiplicação dos pães e peixes', 'O bom samaritano', 'O filho pródigo', 'Zaqueu sobe na árvore', 'A ovelha perdida',
  'Jesus e as crianças', 'A ressurreição de Lázaro', 'A ressurreição de Jesus', 'Pedro anda sobre as águas', 'Paulo no caminho de Damasco',
];

export const ESTILOS = {
  aquarela: { nome: 'Aquarela suave', prompt: 'ilustração de livro infantil em aquarela suave, cores pastel luminosas, traços delicados, textura de papel, estilo livro infantil clássico' },
  desenho: { nome: 'Desenho colorido', prompt: 'ilustração infantil 2D colorida, traço limpo, cores vibrantes, personagens simpáticos e expressivos, estilo desenho animado moderno' },
  pintura: { nome: 'Pintura clássica', prompt: 'pintura a óleo clássica, luz dramática e dourada, pinceladas visíveis, estilo arte sacra' },
  realista: { nome: 'Realista (cinema)', prompt: 'cena realista cinematográfica, luz natural dourada, profundidade de campo, rica em detalhes de época' },
};

/** Quantas páginas de história/capítulos cabem no tamanho escolhido (o resto é capa, rosto e páginas finais). */
export function partes(tipo, paginas) {
  const total = Number(paginas) === 16 ? 16 : 12;
  return tipo === 'adulto' ? total - 5 : total - 4; // adulto: capa, rosto, introdução, conclusão, oração | infantil: capa, rosto, lição, perguntas
}

export function pedidoLivro({ tipo, historia, paginas, detalhes }) {
  const n = partes(tipo, paginas);
  const comum =
    'Você escreve em português do Brasil. Conte a história com as SUAS palavras, fiel ao relato bíblico, sem copiar trechos de nenhuma tradução da Bíblia e sem copiar nenhum livro existente — o texto precisa ser 100% original. ' +
    'Não invente fatos que contradigam o texto bíblico. Responda SÓ com JSON válido.';
  if (tipo === 'adulto') {
    return [
      {
        role: 'system',
        content:
          `Você é escritor de livros devocionais cristãos para adultos. ${comum} ` +
          `Formato: {"titulo": "título do livro (até 50 caracteres, sem subtítulo)", "subtitulo": "até 80 caracteres", "referencia": "onde está na Bíblia (ex.: 1 Samuel 17)", ` +
          `"capa": "descrição visual da capa (cena marcante, sem texto)", ` +
          `"introducao": "cerca de 130 palavras", ` +
          `"capitulos": [exatamente ${n} itens: {"titulo": "título curto do capítulo", "texto": "170 a 200 palavras: narra essa parte da história e reflete sobre ela, em 2 ou 3 parágrafos separados por \\n\\n", ` +
          `"aplicacao": "1 ou 2 frases práticas para a vida de hoje", "oracao": "oração curta, 1 ou 2 frases", "cena": "descrição visual da ilustração do capítulo, sem texto"}], ` +
          `"conclusao": "cerca de 120 palavras", "oracaoFinal": "oração final de 60 a 80 palavras"}. ` +
          'Tom acolhedor, claro e profundo, sem jargão. Os capítulos seguem a história em ordem, do começo ao fim.',
      },
      { role: 'user', content: `História: ${historia}${detalhes ? `\nO que eu quero destacar: ${detalhes}` : ''}` },
    ];
  }
  return [
    {
      role: 'system',
      content:
        `Você é escritor de livros infantis cristãos, para crianças de 4 a 9 anos. ${comum} ` +
        `Formato: {"titulo": "título do livro (até 45 caracteres)", "subtitulo": "até 70 caracteres", "referencia": "onde está na Bíblia (ex.: 1 Samuel 17)", ` +
        `"personagem": "aparência fixa do personagem principal para todas as ilustrações: idade aproximada, cabelo, roupa e cores (1 frase)", ` +
        `"capa": "descrição visual da capa (personagem principal numa cena alegre, sem texto)", ` +
        `"paginas": [exatamente ${n} itens: {"texto": "2 a 4 frases curtas, 35 a 55 palavras, linguagem simples e gostosa de ler em voz alta", "cena": "descrição visual da ilustração dessa página, sem texto"}], ` +
        `"licao": "o que aprendemos, em 3 frases simples", "oracao": "oração curtinha para a criança repetir (2 frases)", "perguntas": ["3 perguntas para conversar com a criança"]}. ` +
        'As páginas contam a história em ordem, com começo, meio e fim. Nada de violência explícita: conte os momentos difíceis de forma suave. Termine com alegria e esperança.',
    },
    { role: 'user', content: `História: ${historia}${detalhes ? `\nO que eu quero destacar: ${detalhes}` : ''}` },
  ];
}

/** Pedido da ilustração para o gerador de imagens. */
export function pedidoImagem({ cena, estilo, tipo, personagem, capa }) {
  const est = ESTILOS[estilo] || ESTILOS[tipo === 'adulto' ? 'pintura' : 'aquarela'];
  return [
    cena,
    personagem ? `Personagem principal sempre assim: ${personagem}` : '',
    est.prompt,
    'cenário e roupas completas da época bíblica, expressão serena, composição limpa',
    capa ? 'composição de capa de livro em pé, personagem em destaque, espaço livre na parte de baixo' : 'composição horizontal de página de livro',
    'Proibido: texto, letras, números, molduras, marcas d\'água, armas, sangue, nudez, violência.',
  ].filter(Boolean).join('. ');
}
