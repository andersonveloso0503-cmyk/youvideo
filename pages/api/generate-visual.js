import { put } from '@vercel/blob';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const ESTILOS_VISUAIS = {
  desenho: 'estilo desenho animado, cores vibrantes, traço consistente, ilustração 2D',
  biblico_classico:
    'pintura clássica bíblica estilo renascentista, técnica de óleo sobre tela, iluminação dramática tipo claro-escuro, cores ricas e profundas, composição de obra de arte sacra tradicional',
  cinematografico:
    'ilustração cinematográfica moderna, iluminação dramática de cinema, cores ricas e contrastadas, composição de still de filme épico, alto nível de detalhe',
  aquarela:
    'estilo aquarela suave, cores translúcidas e delicadas, traços fluidos, textura de papel visível, atmosfera serena e contemplativa',
  realista:
    'fotografia hiper-realista, foto tirada com câmera DSLR, lente 85mm, profundidade de campo rasa, textura de pele natural com poros visíveis, iluminação cinematográfica dramática, grão de filme sutil, 8K, ultra detalhado, NÃO parece pintura nem ilustração digital',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { cenas, estilo, formato } = req.body;
  if (!cenas || !cenas.length) return res.status(400).json({ error: 'Nenhuma cena recebida' });

  if (!process.env.FLUX_API_KEY) {
    return res.status(500).json({
      error: 'FLUX_API_KEY não configurada ainda. Crie conta em dashboard.bfl.ai e adicione no Vercel.',
    });
  }

  const estiloPrompt = ESTILOS_VISUAIS[estilo] || ESTILOS_VISUAIS.realista;

  try {
    const arquivos = [];

    for (const cena of cenas) {
      const promptFinal = `${cena.descricao}, ${estiloPrompt}, personagens bíblicos vestidos com roupas completas da época, composição de cena de vídeo, alta qualidade. Evite: armas, espadas, facas, sangue, ferimentos, nudez, torso nu, violência gráfica.`;

      const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'x-key': process.env.FLUX_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptFinal,
          width: formato === 'short' ? 768 : 1344,
          height: formato === 'short' ? 1344 : 768,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido ao Flux');

      const pollingUrl = submitData.polling_url;
      let imageUrlTemporaria = null;
      let bloqueada = false;
      let tentativas = 0;

      while (tentativas < 45) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollRes = await fetch(pollingUrl, { headers: { 'x-key': process.env.FLUX_API_KEY } });
        const pollData = await pollRes.json();

        if (pollData.status === 'Ready') {
          imageUrlTemporaria = pollData.result?.sample;
          break;
        }
        if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) {
          bloqueada = true;
          break;
        }
        tentativas++;
      }

      if (bloqueada) {
        arquivos.push({
          cena: cena.descricao,
          erro: 'Essa cena foi barrada pelo filtro de conteúdo da Flux e foi pulada.',
        });
        continue;
      }

      if (!imageUrlTemporaria) throw new Error(`Tempo esgotado esperando a imagem da cena "${cena.descricao}"`);

      // O link que a Flux devolve é temporário e expira rápido — baixa a
      // imagem e salva no Blob do próprio projeto, com URL permanente, pra
      // não falhar depois na hora de animar ou montar o vídeo.
      const imgRes = await fetch(imageUrlTemporaria);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const blob = await put(`cena-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, imgBuffer, {
        access: 'public',
        contentType: 'image/jpeg',
        token: process.env.MEDIA_READ_WRITE_TOKEN,
      });

      const arquivo = {
        cena: cena.descricao,
        textoNarrado: cena.textoNarrado || '',
        imageUrl: blob.url,
        // Repassa o tempo explícito da cena quando ele vier definido (fluxo
        // de música, sincronizado com o bloco da letra) — a montagem usa
        // isso em vez de dividir o tempo igualmente entre as cenas.
        ...(cena.start != null && cena.length != null ? { start: cena.start, length: cena.length } : {}),
      };
      arquivos.push(arquivo);
    }

    return res.status(200).json({ arquivos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
