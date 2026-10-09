// "Oração do dia" na Fábrica: um Short de oração por dia, com a data no título
// ("Oração da Manhã de 7 de Outubro: ..."), que é como as pessoas procuram oração no YouTube.
// Segue a mesma linha de produção dos Shorts bíblicos (roteiro → voz → imagens → montagem no PC → agenda).
import { groqJson } from './empresa';

export const PERIODOS = {
  manha: { nome: 'Manhã', hora: '06:00', luz: 'nascer do sol, luz dourada suave da manhã', busca: 'oração da manhã' },
  noite: { nome: 'Noite', hora: '21:00', luz: 'anoitecer, céu estrelado, luz quente e baixa', busca: 'oração da noite' },
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// Um assunto por dia, em rodízio (31 = não repete dentro do mês)
export const INTENCOES = [
  'gratidão por mais um dia de vida', 'proteção para a família', 'sabedoria para as decisões de hoje', 'paz para o coração ansioso',
  'força para quem está cansado', 'portas abertas no trabalho', 'um coração leve, que sabe perdoar', 'direção de Deus para os próximos passos',
  'esperança para quem pensa em desistir', 'bênção sobre os filhos', 'livramento de todo mal', 'fé no meio das dificuldades',
  'restauração da família e dos relacionamentos', 'confiança no tempo de Deus', 'coragem para recomeçar', 'paciência nas provações',
  'alegria e ânimo novo', 'proteção no caminho e no trânsito', 'entrega das preocupações com as contas e o sustento', 'amor ao próximo e bondade',
  'descanso para a mente', 'gratidão pelas pequenas coisas', 'vitória sobre o medo', 'renovação das forças',
  'a presença de Deus dentro de casa', 'cuidado de Deus por quem está doente', 'humildade e obediência a Deus', 'foco e disposição para o trabalho',
  'consolo para quem está com saudade', 'propósito para a vida', 'união e paz entre as pessoas da casa',
];

/** Assunto do dia: rodízio pela data (o mesmo dia sempre cai no mesmo assunto; manhã e noite pegam assuntos diferentes). */
export function intencaoDoDia(dia, periodo) {
  const dias = Math.floor(new Date(`${dia}T12:00:00Z`).getTime() / 86400e3);
  return INTENCOES[(dias + (periodo === 'noite' ? 15 : 0)) % INTENCOES.length];
}

/** '2026-10-07' -> '7 de Outubro' */
export function dataPorExtenso(dia) {
  const [, m, d] = String(dia).split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

export function diaDaSemana(dia) {
  return SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
}

/** Título fixo, no formato que as pessoas buscam. */
export function tituloOracao({ dia, periodo, frase }) {
  const p = PERIODOS[periodo] || PERIODOS.manha;
  const base = `Oração da ${p.nome} de ${dataPorExtenso(dia)}`;
  const f = String(frase || '').replace(/["“”]/g, '').replace(/[.!]+$/, '').replace(/\s+/g, ' ').trim();
  return f ? `${base}: ${f}`.slice(0, 78) : base;
}

/** Roteiro da oração no mesmo formato dos roteiros narrados: { titulo, descricao, tags, narracao, cenas }. */
export async function gerarRoteiroOracaoDia({ dia, periodo, assunto }) {
  const p = PERIODOS[periodo] || PERIODOS.manha;
  const semana = diaDaSemana(dia);
  const j = await groqJson([
    {
      role: 'system',
      content:
        `Você escreve orações curtas para um canal cristão brasileiro, para a pessoa ouvir ${periodo === 'noite' ? 'antes de dormir' : 'logo que acorda'}. ` +
        'Responda só JSON neste formato: ' +
        '{"frase": "complemento do título, de 4 a 8 palavras, com as iniciais maiúsculas, começando por um verbo (ex.: Comece o Dia com Gratidão a Deus; Entregue Suas Preocupações a Deus)", ' +
        '"descricao": "2 frases calorosas dizendo para quem é esta oração e convidando a orar junto", ' +
        '"narracao": "a oração completa, com 150 a 170 palavras", ' +
        '"cenas": [{"descricao": "descrição visual de uma imagem serena", "textoNarrado": "trecho da oração dessa cena"}]}. ' +
        'REGRAS DA ORAÇÃO: é uma oração de verdade, em primeira pessoa, falando com Deus ("Senhor, hoje eu venho a Ti..."); tom calmo e acolhedor, frases curtas; ' +
        `fala do assunto pedido e pode citar o dia (${semana}); pode lembrar UMA promessa da Bíblia com as próprias palavras, sem citar versículo literal; ` +
        'não prometa cura, dinheiro nem milagre garantido; termine com "em nome de Jesus, amém" e, depois, UMA frase curta pedindo para comentar "Amém" e seguir o perfil para orar todos os dias (use "segue", que vale para YouTube, TikTok e Instagram). ' +
        'REGRAS DAS CENAS: exatamente 3 cenas; a soma dos "textoNarrado" é a oração inteira, na ordem; ' +
        `cada "descricao" é uma fotografia serena e bonita (${p.luz}): céu, montanhas, campo, mar calmo, janela com luz entrando, Bíblia aberta sobre a mesa, mãos unidas em oração, pessoa adulta de costas olhando o horizonte; ` +
        'nada de texto, letras, rostos em close, sofrimento, hospital, ferimentos ou cenas tristes.',
    },
    { role: 'user', content: `Oração da ${p.nome.toLowerCase()} de ${dataPorExtenso(dia)} (${semana}). Assunto: ${assunto}.` },
  ], 0.9);
  if (!j.narracao || !Array.isArray(j.cenas) || !j.cenas.length) throw new Error('Oração: a IA não devolveu o texto completo');
  const titulo = tituloOracao({ dia, periodo, frase: j.frase });
  return {
    titulo,
    descricao: `${titulo}. ${String(j.descricao || '').trim()}`.trim(),
    tags: [p.busca, `${p.busca} de hoje`, 'oração do dia', 'oração de hoje', 'oração poderosa', 'oração', 'oração curta', 'deus', 'jesus', 'fé', String(assunto).split(',')[0].slice(0, 40)],
    narracao: String(j.narracao),
    cenas: j.cenas.slice(0, 4).map((c) => ({ descricao: String(c.descricao || ''), textoNarrado: String(c.textoNarrado || '') })),
  };
}
