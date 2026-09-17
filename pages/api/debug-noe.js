import { getDb } from '../../lib/firebase-admin';

// TEMPORÁRIO — só pra descobrir por que o localizador não achou o item.
// Depois de resolver, pode apagar este arquivo.
export default async function handler(req, res) {
  try {
    const db = getDb();

    // Busca em youvideo_projects pelo título (usando >= e <= como um "contém" aproximado não dá,
    // então trazemos os mais recentes e filtramos aqui mesmo)
    const projSnap = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(50).get();
    const projetos = projSnap.docs
      .map((d) => ({ id: d.id, titulo: d.data().titulo, tema: d.data().tema, criadoEm: d.data().criadoEm }))
      .filter((p) => (p.titulo || '').includes('Noé') || (p.tema || '').includes('Noé') || (p.tema || '').includes('Noe'));

    // Busca em youvideo_fila pelo tema
    const filaSnap = await db.collection('youvideo_fila').orderBy('criadoEm', 'desc').limit(50).get();
    const filaItens = filaSnap.docs
      .map((d) => ({
        id: d.id,
        tema: d.data().tema,
        status: d.data().status,
        tituloRoteiro: d.data().roteiro?.titulo,
        criadoEm: d.data().criadoEm,
      }))
      .filter((f) => (f.tema || '').includes('Noé') || (f.tema || '').includes('Noe') || (f.tituloRoteiro || '').includes('Noé'));

    return res.status(200).json({ projetos, filaItens });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
