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

  const formatoInstrucao = `Formato Short cômico: a soma de todas as falas precisa ter aproximadamente ${palavrasAlvo} palavras no total (pra durar bem perto de ${duracaoMin > 0 ? `${duracaoMin}min ` : ''}${duracaoSeg}s ao ser tudo falado). Ritmo rápido, direto, sem enrolação — cada fala empurra pra piada/virada seguinte.`;

  const prompt = `Você é roteirista de humor de um canal de conteúdo bíblico no YouTube/Shorts/Reels/Kwai chamado "Em Nome de Jesus".
Situação engraçada a desenvolver: "${tema}"
Estilo visual: ${estilo}
${formatoInstrucao}

FORMATO NOVO — o roteiro agora é dividido em FALAS, alternando entre um Narrador (que conduz a piada) e os PERSONAGENS falando diretamente (com aspas, tipo dublagem/dublê cômico) — como um esquete de humor com narração + vozes dos personagens, não um vídeo só narrado.
- Cada cena do JSON é UMA fala de UMA pessoa só (o Narrador OU um personagem).
- Alterne entre Narrador e personagens; nem toda cena precisa ter um personagem falando, mas pelo menos metade das cenas deve ter alguém além do Narrador com fala direta entre aspas.
- Para cada cena, escolha um "vozTipo":
  - "normal": narrador ou personagem humano falando de forma comum
  - "grave": personagem grandalhão, imponente, vilão cômico ou autoritário (fica com voz mais grave e forte)
  - "aguda": efeito engraçado tipo desenho animado — ótimo pra animal falando, personagem espalhafatoso, ou o momento mais engraçado da cena (fica com voz mais fina e cômica)

REGRAS DE HUMOR (siga à risca):
- O humor vem da situação humana, do exagero cômico, do timing e do contraste "personagem bíblico enfrentando um perrengue bem humano" — NUNCA de deboche da fé, de Deus, de Jesus ou de passagens sagradas. Trate os personagens com carinho, como se fossem protagonistas de uma comédia de situação, não alvo de piada cruel.
- Evite ironia sobre milagres, sobre a existência de Deus ou sobre o sentido religioso da história. A graça é no "e se isso acontecesse com uma pessoa normal hoje", no comportamento exagerado, no diálogo engraçado — não na zombaria do conteúdo sagrado.
- Pode usar comparação com o cotidiano moderno (grupo de zap, trânsito, chefe chato, reunião longa) desde que fique claro que é brincadeira leve, sem anacronismo literal nas cenas visuais (as descrições visuais continuam de época).
- Gancho cômico já na primeira fala (nada de "olá pessoal" ou introdução genérica) — comece direto na virada engraçada ou na pergunta provocativa.
- Termine com uma "piada de saída" ou call-back engraçado, seguido de um convite curto e natural pra seguir/curtir (varie a frase a cada vídeo) — pode ser o Narrador dizendo isso na última cena.

REGRAS VISUAIS (segurança de geração por IA — aplique sempre):
- Descreva cenas de forma visualmente segura: evite completamente palavras como "cruz", "crucificação", "sangue", "ferimentos", "soldados armados", "chicote", "coroa de espinhos", "espada", "faca", "lança", "arma" nas descrições visuais — mesmo em cenas de conflito, descreva sem mencionar objetos que cortam ou ferem. Evite também personagens sem camisa/torso nu; vista sempre com roupas típicas da época, completas.
- Não copie trechos literais de nenhuma tradução da Bíblia; a situação é sua criação livre inspirada no personagem/contexto.

Retorne APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "titulo": "Título curto e engraçado, formato de virada cômica ou comparação com o cotidiano moderno (ex: 'Noé no Modo Difícil: Organizar os Animais na Arca', 'Se Jonas Tivesse Grupo de Zap com os Peixes', 'Golias Esperando Alguém Topar o Duelo Há 40 Dias'). Chamativo, engraçado, em português",
  "thumbnailTitulo": "o NOME do personagem principal, ou no máximo 2 palavras, BEM GRANDE na thumbnail, em maiúsculas, em português (ex: 'NOÉ', 'GOLIAS', 'JONAS')",
  "thumbnailSubtitulo": "frase curta de 4 a 7 palavras, engraçada/provocativa, pra aparecer menor abaixo do título, em maiúsculas, em português (ex: 'ISSO NÃO TAVA NO PLANO', 'DIA RUIM PRA ESSE CARA')",
  "descricao": "descrição CURTA e engraçada para o YouTube, em português: 1 a 2 frases (no máximo 30 palavras) provocando curiosidade sem entregar a piada. Depois, pule uma linha e coloque de 5 a 8 hashtags relevantes (ex: #biblia #humor #fe #shorts).",
  "tags": ["12 a 15 tags relevantes em português, misturando termos amplos (ex: humor bíblico, comédia cristã) e específicos (ex: nome do personagem)"],
  "cenas": [
    {
      "personagem": "Narrador ou o nome do personagem que está falando nessa cena",
      "textoNarrado": "o texto exato dessa fala (sem aspas no JSON, mas se for o personagem falando, escreva como fala direta)",
      "vozTipo": "normal, grave ou aguda",
      "descricao": "descrição visual da cena para gerar imagem, mostrando quem está falando"
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

    // Garante um valor padrão de vozTipo/personagem caso o modelo esqueça algum campo.
    if (Array.isArray(parsed.cenas)) {
      parsed.cenas = parsed.cenas.map((c) => ({
        ...c,
        personagem: c.personagem || 'Narrador',
        vozTipo: ['normal', 'grave', 'aguda'].includes(c.vozTipo) ? c.vozTipo : 'normal',
      }));
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
