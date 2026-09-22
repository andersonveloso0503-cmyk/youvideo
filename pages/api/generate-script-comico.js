// Aumenta o limite de execução da função (padrão é bem curto e cortava
// respostas de IA mais demoradas no meio). Precisa do plano Pro do
// Vercel pra valer mais que ~60s.
export const maxDuration = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, estilo, formato, duracaoDesejada } = req.body;
  if (!tema) return res.status(400).json({ error: 'Situação é obrigatória' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  const duracaoSegundos = Number(duracaoDesejada) || 60;
  const palavrasAlvo = Math.round(duracaoSegundos * 2.3); // ritmo médio de narração em português
  const duracaoMin = Math.floor(duracaoSegundos / 60);
  const duracaoSeg = duracaoSegundos % 60;

  const formatoInstrucao = `Formato Short cômico: a narração precisa ter aproximadamente ${palavrasAlvo} palavras (pra durar bem perto de ${duracaoMin > 0 ? `${duracaoMin}min ` : ''}${duracaoSeg}s ao ser falada). Ritmo rápido, direto, sem enrolação — cada frase empurra pra piada/virada seguinte.`;

  const prompt = `Você é roteirista de humor de um canal de conteúdo bíblico no YouTube/Shorts/Reels/Kwai chamado "Em Nome de Jesus".
Situação engraçada a desenvolver: "${tema}"
Estilo visual: ${estilo}
${formatoInstrucao}

REGRAS DE HUMOR (siga à risca):
- O humor vem da situação humana, do exagero cômico, do timing e do contraste "personagem bíblico enfrentando um perrengue bem humano" — NUNCA de deboche da fé, de Deus, de Jesus ou de passagens sagradas. Trate os personagens com carinho, como se fossem protagonistas de uma comédia de situação, não alvo de piada cruel.
- Evite ironia sobre milagres, sobre a existência de Deus ou sobre o sentido religioso da história. A graça é no "e se isso acontecesse com uma pessoa normal hoje", no comportamento exagerado, no diálogo engraçado — não na zombaria do conteúdo sagrado.
- Pode usar comparação com o cotidiano moderno (grupo de zap, trânsito, chefe chato, reunião longa) desde que fique claro que é brincadeira leve, sem anacronismo literal nas cenas visuais (as CENAS continuam de época).
- Gancho cômico já na primeira frase (nada de "olá pessoal" ou introdução genérica) — comece direto na virada engraçada ou na pergunta provocativa.
- Termine com uma "piada de saída" ou call-back engraçado, seguido de um convite curto e natural pra seguir/curtir (varie a frase a cada vídeo).

REGRAS VISUAIS (segurança de geração por IA — aplique sempre):
- Descreva cenas de forma visualmente segura: evite completamente palavras como "cruz", "crucificação", "sangue", "ferimentos", "soldados armados", "chicote", "coroa de espinhos", "espada", "faca", "lança", "arma" nas descrições visuais — mesmo em cenas de conflito, descreva sem mencionar objetos que cortam ou ferem. Evite também personagens sem camisa/torso nu; vista sempre com roupas típicas da época, completas.
- Não copie trechos literais de nenhuma tradução da Bíblia; a situação é sua criação livre inspirada no personagem/contexto.
- Divida a narração em cenas curtas, cada uma como um clipe de vídeo separado, pensando no timing cômico (cena de "montagem", cena de "reação", cena de "virada").

Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "titulo": "Título curto e engraçado, formato de virada cômica ou comparação com o cotidiano moderno (ex: 'Noé no Modo Difícil: Organizar os Animais na Arca', 'Se Jonas Tivesse Grupo de Zap com os Peixes', 'Golias Esperando Alguém Topar o Duelo Há 40 Dias'). Chamativo, engraçado, em português",
  "thumbnailTitulo": "o NOME do personagem principal, ou no máximo 2 palavras, BEM GRANDE na thumbnail, em maiúsculas, em português (ex: 'NOÉ', 'GOLIAS', 'JONAS')",
  "thumbnailSubtitulo": "frase curta de 4 a 7 palavras, engraçada/provocativa, pra aparecer menor abaixo do título, em maiúsculas, em português (ex: 'ISSO NÃO TAVA NO PLANO', 'DIA RUIM PRA ESSE CARA')",
  "descricao": "descrição CURTA e engraçada para o YouTube, em português: 1 a 2 frases (no máximo 30 palavras) provocando curiosidade sem entregar a piada. Depois, pule uma linha e coloque de 5 a 8 hashtags relevantes (ex: #biblia #humor #fe #shorts).",
  "tags": ["12 a 15 tags relevantes em português, misturando termos amplos (ex: humor bíblico, comédia cristã) e específicos (ex: nome do personagem)"],
  "narracao": "texto completo da narração, em português, tom leve e engraçado do início ao fim. Termine com a piada de saída + convite curto pra seguir/curtir (varie a frase a cada vídeo).",
  "cenas": [
    { "descricao": "descrição visual da cena para gerar imagem/vídeo", "textoNarrado": "trecho da narração correspondente" }
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
          temperature: tentativaExtra ? 0.4 : 0.9,
          max_completion_tokens: 16000,
          response_format: { type: 'json_object' },
        }),
      });
      return groqRes.json();
    };

    let data = await chamarGroq(false);
    let content = data.choices?.[0]?.message?.content?.trim() || '';
    content = content.replace(/^```json/, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Segunda tentativa, mais conservadora, pedindo explicitamente JSON puro.
      data = await chamarGroq(true);
      content = data.choices?.[0]?.message?.content?.trim() || '';
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(
          'A resposta do modelo não veio em JSON válido mesmo após tentar de novo. Tente uma situação mais simples ou direta.'
        );
      }
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
