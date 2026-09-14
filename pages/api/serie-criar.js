import { put } from '@vercel/blob';
import { getDb } from '../../lib/firebase-admin';

const ESTILOS_VISUAIS = {
  desenho: 'estilo desenho animado, cores vibrantes, traço consistente, ilustração 2D',
  biblico_classico:
    'pintura clássica bíblica estilo renascentista, técnica de óleo sobre tela, iluminação dramática tipo claro-escuro, cores ricas e profundas',
  cinematografico:
    'ilustração cinematográfica moderna, iluminação dramática de cinema, cores ricas e contrastadas, alto nível de detalhe',
  realista:
    'fotografia hiper-realista, foto tirada com câmera DSLR, lente 85mm, profundidade de campo rasa, textura de pele natural com poros visíveis, iluminação cinematográfica dramática, 8K, ultra detalhado',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { nome, descricaoPersonagem, estilo } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da série é obrigatório' });
  if (!descricaoPersonagem) return res.status(400).json({ error: 'Descrição do personagem é obrigatória' });
  if (!process.env.FLUX_API_KEY) return res.status(500).json({ error: 'FLUX_API_KEY não configurada' });

  const estiloPrompt = ESTILOS_VISUAIS[estilo] || ESTILOS_VISUAIS.realista;

  try {
    const prompt = `Retrato de corpo inteiro de referência de personagem: ${descricaoPersonagem}. ${estiloPrompt}. Fundo neutro e simples (estúdio, cor sólida clara), iluminação uniforme e clara no rosto, pose neutra de frente pra câmera, expressão calma. Essa imagem serve como referência de identidade visual pra ser reaproveitada em outras cenas depois — o objetivo é mostrar claramente o rosto e as roupas do personagem, sem elementos de cena ao fundo. Vestido com roupas completas da época. Evite: armas, sangue, nudez, violência.`;

    const submitRes = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1024, height: 1024 }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(submitData.detail || 'Erro ao enviar pedido à Flux');

    const pollingUrl = submitData.polling_url;
    let imageUrlTemporaria = null;
    let tentativas = 0;
    while (tentativas < 60) {
      await new Promise((r) => setTimeout(r, 1000));
      const pollRes = await fetch(pollingUrl, { headers: { 'x-key': process.env.FLUX_API_KEY } });
      const pollData = await pollRes.json();
      if (pollData.status === 'Ready') {
        imageUrlTemporaria = pollData.result?.sample;
        break;
      }
      if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(pollData.status)) {
        throw new Error(`A geração do personagem foi bloqueada pelo filtro de conteúdo (${pollData.status}). Tente descrever de outro jeito.`);
      }
      tentativas++;
    }
    if (!imageUrlTemporaria) throw new Error('Tempo esgotado esperando a imagem de referência');

    const imgRes = await fetch(imageUrlTemporaria);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const blob = await put(`serie-personagem-${Date.now()}.jpg`, imgBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });

    const db = getDb();
    const docRef = await db.collection('youvideo_series').add({
      nome,
      descricaoPersonagem,
      estilo: estilo || 'realista',
      imagemReferenciaUrl: blob.url,
      criadoEm: new Date().toISOString(),
    });

    return res.status(200).json({ id: docRef.id, imagemReferenciaUrl: blob.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
