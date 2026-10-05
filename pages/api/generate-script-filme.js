// Cortes de Filme — roteiro de UMA cena bíblica curta, no ritmo de um corte de filme:
// começa no momento mais forte, quase tudo em diálogo, falas curtas, final de impacto.
// Tudo é criação própria (roteiro, vozes e imagens são gerados do zero): não usa nem
// imita trecho de filme ou série que já existe.
//
// POST { tema, formato, duracaoDesejada, tom } -> mesmo formato do roteiro dos cortes cômicos
//   { titulo, thumbnailTitulo, thumbnailSubtitulo, descricao, tags, referencia,
//     cenas: [{ personagem, sexo, textoNarrado, vozTipo, descricao }] }

// Aumenta o limite de execução da função (padrão é bem curto e cortava
// respostas de IA mais demoradas no meio). Precisa do plano Pro do
// Vercel pra valer mais que ~60s.
export const maxDuration = 300;

const TONS = {
  emocionante: 'emocionante e comovente: a cena cresce até um momento que aperta o coração e termina em consolo',
  tenso: 'tenso, de suspense: o perigo aumenta a cada fala e a virada só vem no fim',
  esperanca: 'de esperança e vitória: começa no pior momento e termina com a resposta de Deus',
  confronto: 'de confronto: duas pessoas frente a frente, falas firmes, silêncio pesado, e uma resposta que desarma',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, duracaoDesejada, tom } = req.body || {};
  if (!tema || !String(tema).trim()) return res.status(400).json({ error: 'Escolha ou descreva a cena' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  const duracaoSegundos = Math.max(20, Math.min(90, Number(duracaoDesejada) || 45));
  // Um pouco abaixo do ritmo de narração comum: fala de cena tem pausa e respiro
  const palavrasAlvo = Math.round(duracaoSegundos * 2.1);
  const cenasMin = Math.max(5, Math.round(duracaoSegundos / 6));
  const cenasMax = Math.max(cenasMin + 2, Math.round(duracaoSegundos / 3.5));
  const tomTexto = TONS[tom] || TONS.emocionante;

  const prompt = `Você é roteirista e diretor de cinema. Escreva UMA cena curta, no ritmo de um corte de filme, para o canal cristão "Em Nome de Jesus" (YouTube Shorts, Reels, TikTok e Kwai).

Cena a dramatizar: "${String(tema).trim().slice(0, 1200)}"
Tom: ${tomTexto}.
Duração: a soma de todas as falas deve ter cerca de ${palavrasAlvo} palavras (perto de ${duracaoSegundos} segundos faladas), divididas em ${cenasMin} a ${cenasMax} falas.

COMO É UM CORTE DE FILME (siga à risca):
- Comece NO MEIO da ação, no instante de maior tensão. Nada de "olá", "você sabia", contexto histórico ou apresentação.
- É uma CENA, não um vídeo narrado: a maior parte das falas é de PERSONAGENS falando entre si, em fala direta. O Narrador aparece pouco (no máximo 1 a cada 3 falas), só para situar ou cortar o tempo, com frases curtas.
- Cada item de "cenas" é UMA fala de UMA pessoa só, com 4 a 14 palavras. Fala curta, do jeito que gente fala, com pausas e emoção. Sem discurso longo.
- Cada fala é também um corte de câmera: mude o enquadramento de uma para a outra (close no rosto, plano aberto, por cima do ombro, detalhe das mãos, multidão ao fundo).
- A virada ou o milagre acontece perto do fim. A última fala é a frase de impacto que fica na cabeça. Não termine pedindo like ou inscrição.

FIDELIDADE (muito importante):
- Seja fiel ao relato bíblico: mesmos personagens, mesma ordem dos fatos, mesmo desfecho. Não invente milagre, personagem importante, doutrina ou final diferente.
- Escreva as falas com as SUAS palavras, no sentido do texto. Não copie versículos ao pé da letra de nenhuma tradução da Bíblia.
- As falas de Jesus são poucas, serenas e cheias de autoridade. Trate Jesus, Deus e a fé com reverência. Nada de piada.
- Tudo aqui é criação original. Não copie nem imite falas, cenas ou personagens de filmes, séries ou novelas que já existem, e nunca escreva que isto é trecho de algum filme ou série (nem no título, nem na descrição, nem nas tags).

VOZES:
- "sexo": "homem" ou "mulher", de quem fala nessa cena (o Narrador é "homem").
- "vozTipo": "normal" para quase todos. Use "grave" só para figura imponente ou ameaçadora (um rei, um gigante, um acusador). Jesus é sempre "normal".

IMAGENS (cada imagem é gerada sozinha, sem ver as outras):
- Em "descricao", escreva o enquadramento de cinema da cena: quem aparece, o que faz, a expressão do rosto, o lugar, a hora do dia e a luz.
- Repita em TODAS as cenas em que o personagem aparece a MESMA descrição física dele (idade aproximada, cabelo, barba, cor e tipo da roupa), com as mesmas palavras, para o rosto e a roupa não mudarem de uma cena para outra.
- Roupas de época completas, cenário de época, nada moderno. Sem texto, letreiro ou legenda dentro da imagem.
- Segurança da geração por IA: não use nas descrições visuais as palavras "cruz", "crucificação", "sangue", "ferimento", "chicote", "coroa de espinhos", "espada", "faca", "lança", "arma" nem "soldados armados". Em cena de conflito, mostre os rostos, a multidão e a tensão, sem objetos que ferem. Ninguém sem camisa.

Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "titulo": "título curto e forte, em português, que desperta curiosidade sem enganar (ex.: 'Ele Estava Afundando Quando Ouviu Isso', 'Ninguém Atirou a Primeira Pedra'). Até 60 caracteres",
  "thumbnailTitulo": "1 ou 2 palavras BEM GRANDES para a miniatura, em maiúsculas (ex.: 'PEDRO', 'LÁZARO')",
  "thumbnailSubtitulo": "frase de 3 a 6 palavras, em maiúsculas, para aparecer menor (ex.: 'ELE COMEÇOU A AFUNDAR')",
  "referencia": "livro e capítulo da Bíblia onde está essa história (ex.: 'Mateus 14')",
  "descricao": "1 ou 2 frases (até 30 palavras) que provocam curiosidade sem contar o final. Pule uma linha e escreva 'Baseado em ' seguido da referência bíblica. Pule outra linha e coloque de 5 a 8 hashtags (ex.: #biblia #jesus #fe #shorts)",
  "tags": ["12 a 15 tags em português, misturando termos amplos (histórias bíblicas, Jesus, fé) e específicos (nome do personagem, nome do episódio)"],
  "cenas": [
    {
      "personagem": "nome de quem fala (ex.: Pedro, Jesus, Marta) ou Narrador",
      "sexo": "homem ou mulher",
      "textoNarrado": "o texto exato dessa fala, sem aspas",
      "vozTipo": "normal ou grave",
      "descricao": "enquadramento de cinema dessa cena para gerar a imagem"
    }
  ]
}`;

  try {
    const chamarGroq = async (tentativaExtra) => {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'user', content: prompt },
            ...(tentativaExtra
              ? [{ role: 'user', content: 'Sua última resposta não era um JSON válido. Responda APENAS com o objeto JSON, sem nenhum texto antes ou depois, sem comentários, com todas as aspas internas escapadas corretamente.' }]
              : []),
          ],
          temperature: tentativaExtra ? 0.4 : 0.85,
          max_completion_tokens: 16000,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await groqRes.json();
      if (!groqRes.ok) {
        const erro = new Error(`Groq: ${data.error?.message || 'erro ao escrever o roteiro'}`);
        erro.daGroq = true;
        throw erro;
      }
      return data;
    };

    const ler = (data) => {
      const content = (data.choices?.[0]?.message?.content || '').trim().replace(/^```json/, '').replace(/```$/, '').trim();
      const obj = JSON.parse(content);
      if (!Array.isArray(obj.cenas) || !obj.cenas.length) throw new Error('sem cenas');
      return obj;
    };

    let parsed;
    try {
      parsed = ler(await chamarGroq(false));
    } catch (primeiroErro) {
      // Erro de chave/limite da Groq não melhora tentando de novo: mostra o motivo
      if (primeiroErro.daGroq) throw primeiroErro;
      try {
        parsed = ler(await chamarGroq(true));
      } catch (segundoErro) {
        if (segundoErro.daGroq) throw segundoErro;
        throw new Error('O roteiro não veio no formato certo mesmo tentando de novo. Clique em "Executar etapa" outra vez ou descreva a cena de um jeito mais simples.');
      }
    }

    // Garante os campos que o resto do painel usa, mesmo se o modelo esquecer algum
    parsed.cenas = parsed.cenas
      .filter((c) => c && String(c.textoNarrado || '').trim())
      .map((c) => ({
        ...c,
        personagem: String(c.personagem || 'Narrador').trim() || 'Narrador',
        sexo: /mulher|femin/i.test(String(c.sexo || '')) ? 'mulher' : 'homem',
        textoNarrado: String(c.textoNarrado).trim(),
        // Sem voz "aguda" aqui: é o efeito cômico dos cortes engraçados
        vozTipo: c.vozTipo === 'grave' ? 'grave' : 'normal',
        descricao: String(c.descricao || '').trim(),
      }));
    if (!parsed.cenas.length) throw new Error('O roteiro veio sem falas. Clique em "Executar etapa" outra vez.');
    parsed.titulo = String(parsed.titulo || '').trim() || 'Cena bíblica';
    parsed.referencia = String(parsed.referencia || '').trim();
    if (!Array.isArray(parsed.tags)) parsed.tags = [];

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
