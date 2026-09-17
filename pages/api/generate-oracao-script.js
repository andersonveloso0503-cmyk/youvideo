import { gerarRoteiroOracao } from '../../lib/pipeline';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tema, duracaoDesejada } = req.body;
  if (!tema) return res.status(400).json({ error: 'Tema é obrigatório' });

  try {
    const roteiro = await gerarRoteiroOracao({ tema, duracaoDesejada });
    return res.status(200).json(roteiro);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
