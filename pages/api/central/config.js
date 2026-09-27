// Guarda as configurações do Compilador para passar de um PC para outro.
// O conteúdo chega JÁ CRIPTOGRAFADO pelo app (com a senha da Central) — a nuvem não consegue ler.
// GET -> { dados, em } | PUT { dados } -> { ok }
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const ref = getDb().collection('youvideo_central').doc('compilador_config');
  try {
    if (req.method === 'GET') {
      const d = await ref.get();
      return res.status(200).json(d.exists ? d.data() : { dados: null });
    }
    if (req.method === 'PUT') {
      const { dados } = req.body || {};
      if (typeof dados !== 'string' || dados.length > 900000) return res.status(400).json({ erro: 'Dados inválidos.' });
      await ref.set({ dados, em: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
