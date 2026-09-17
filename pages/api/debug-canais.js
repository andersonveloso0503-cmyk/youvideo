// pages/api/debug-canais.js
//
// TEMPORÁRIO — só pra diagnosticar o problema do canal "não encontrado".
// Depois de resolver, pode apagar este arquivo.

import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('canais').get();

    const canais = snapshot.docs.map((doc) => ({
      id: doc.id,
      nome: doc.data().nome,
      status: doc.data().status,
    }));

    // Mostra também qual projeto Firebase está sendo usado de verdade
    const app = db.app;

    return res.status(200).json({
      totalEncontrados: canais.length,
      projectId: app.options.credential?.projectId || app.options.projectId || 'não identificado',
      canais,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
