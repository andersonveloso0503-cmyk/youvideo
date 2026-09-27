// POST /api/central/categoria  { origem, id, categoria }  — muda a pasta de um vídeo na Biblioteca
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken, CATEGORIAS } from '../../../lib/central';

const COLECOES = { projeto: 'youvideo_projects', medley: 'youvideo_medley', musica: 'youvideo_musica_fila' };

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  const { origem, id, categoria } = req.body || {};
  if (!COLECOES[origem] || !id) return res.status(400).json({ erro: 'Esse item não pode mudar de pasta.' });
  if (!CATEGORIAS[categoria]) return res.status(400).json({ erro: 'Categoria inválida.' });
  try {
    await getDb().collection(COLECOES[origem]).doc(String(id)).update({ categoria });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
