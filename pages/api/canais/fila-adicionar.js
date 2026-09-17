import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { canalId, tema, estilo, formato, duracaoDesejada, animar } = req.body;
  if (!canalId) return res.status(400).json({ error: 'canalId é obrigatório' });
  if (!tema) return res.status(400).json({ error: 'Tema é obrigatório' });

  try {
    const db = getDb();
    const canalSnap = await db.collection('canais').doc(canalId).get();
    if (!canalSnap.exists) return res.status(404).json({ error: 'Canal não encontrado' });
    const canal = canalSnap.data();

    // Usa o formato/estilo padrão do canal quando não vier explícito no pedido
    const formatoFinal = formato || (canal.formato === 'shorts' ? 'short' : 'longo');
    const estiloFinal = estilo || canal.identidade?.estiloVisual || 'realista';

    const docRef = await db.collection('youvideo_fila').add({
      canalId,
      tema,
      estilo: estiloFinal,
      formato: formatoFinal,
      duracaoDesejada: duracaoDesejada || (formatoFinal === 'short' ? '180' : '420'),
      animar: animar !== false,
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    });
    return res.status(200).json({ id: docRef.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
