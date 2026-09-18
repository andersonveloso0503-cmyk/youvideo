// pages/api/publicar-social.js
//
// Uso: POST /api/publicar-social
// Corpo (JSON):
//   {
//     "tipo": "video" | "imagem",
//     "midiaUrl": "https://.../video-ou-imagem-final.mp4",  // precisa ser uma URL pública
//     "legenda": "texto da legenda/descrição do post"
//   }
//
// Publica na Página "Em Nome de Jesus" e no Instagram @emnomedejesus_rs.
// Se um dos dois falhar, o outro ainda é tentado — a resposta mostra o
// resultado de cada um separadamente.
import { publicarVideoFacebook, publicarImagemFacebook, publicarNoInstagram } from '../../lib/publicarSocial';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { tipo, midiaUrl, legenda } = req.body || {};

  if (!tipo || !midiaUrl) {
    return res.status(400).json({ erro: 'Faltou "tipo" (video ou imagem) ou "midiaUrl".' });
  }
  if (tipo !== 'video' && tipo !== 'imagem') {
    return res.status(400).json({ erro: '"tipo" precisa ser "video" ou "imagem".' });
  }

  const resultado = { facebook: null, instagram: null };

  // Facebook
  try {
    resultado.facebook =
      tipo === 'video'
        ? await publicarVideoFacebook({ videoUrl: midiaUrl, legenda })
        : await publicarImagemFacebook({ imagemUrl: midiaUrl, legenda });
  } catch (err) {
    resultado.facebook = { erro: err.message };
  }

  // Instagram
  try {
    resultado.instagram = await publicarNoInstagram({ tipo, midiaUrl, legenda });
  } catch (err) {
    resultado.instagram = { erro: err.message };
  }

  const algumErro = resultado.facebook?.erro || resultado.instagram?.erro;
  return res.status(algumErro ? 207 : 200).json(resultado);
}
