import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();

    // Pega o tema mais antigo ainda não usado.
    const temasSnap = await db
      .collection('youvideo_temas')
      .where('usado', '==', false)
      .orderBy('criadoEm', 'asc')
      .limit(1)
      .get();

    if (temasSnap.empty) {
      return res.status(200).json({ mensagem: 'Todos os temas cadastrados já foram usados — adicione mais em /temas.' });
    }

    const temaDoc = temasSnap.docs[0];
    const tema = temaDoc.data().tema;

    // Alterna formato: olha o último vídeo agendado automaticamente e usa o
    // formato oposto dessa vez.
    const ultimoAutoSnap = await db
      .collection('youvideo_fila')
      .where('origem', '==', 'auto')
      .orderBy('criadoEm', 'desc')
      .limit(1)
      .get();

    const ultimoFormato = ultimoAutoSnap.empty ? null : ultimoAutoSnap.docs[0].data().formato;
    const formato = ultimoFormato === 'longo' ? 'short' : 'longo';
    const duracaoDesejada = formato === 'short' ? '180' : '420';

    // Anima só 1 vídeo a cada 7 (uma vez por semana) — o resto sai estático,
    // pra caber no orçamento combinado.
    const contagemSnap = await db.collection('youvideo_fila').where('origem', '==', 'auto').count().get();
    const totalAuto = contagemSnap.data().count;
    const animar = totalAuto % 7 === 0;

    await db.collection('youvideo_fila').add({
      tema,
      estilo: 'desenho',
      formato,
      duracaoDesejada,
      animar,
      origem: 'auto',
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    });

    await temaDoc.ref.update({ usado: true, usadoEm: new Date().toISOString() });

    return res.status(200).json({ agendado: tema, formato, animar });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
