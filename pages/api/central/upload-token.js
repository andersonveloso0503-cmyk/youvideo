// POST /api/central/upload-token { nome, tamanho } -> { token, pathname }
// Dá ao Compilador uma permissão temporária para subir um vídeo do PC direto para o
// Vercel Blob (precisa de link público para Facebook/Instagram/TikTok).
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { exigirToken } from '../../../lib/central';

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  try {
    const nome = String(req.body?.nome || 'video.mp4').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'video.mp4';
    const pathname = `central/videos/${Date.now().toString(36)}-${nome.replace(/\s+/g, '-')}`;
    const token = await generateClientTokenFromReadWriteToken({
      token: BLOB_TOKEN,
      pathname,
      maximumSizeInBytes: 4 * 1024 * 1024 * 1024,
      allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'image/jpeg', 'image/png'],
      validUntil: Date.now() + 6 * 3600e3,
      addRandomSuffix: true,
    });
    return res.status(200).json({ token, pathname });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
