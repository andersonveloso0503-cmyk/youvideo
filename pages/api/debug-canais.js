// pages/api/debug-canais.js
//
// TEMPORÁRIO — só pra diagnosticar o problema do canal "não encontrado".
// Depois de resolver, pode apagar este arquivo.

import { getDb } from '../../lib/firebase-admin';
import { getApps } from 'firebase-admin/app';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('canais').get();

    const canais = snapshot.docs.map((doc) => ({
      id: doc.id,
      nome: doc.data().nome,
      status: doc.data().status,
    }));

    const apps = getApps();
    const projectId = apps[0]?.options?.projectId || apps[0]?.options?.credential?.projectId || 'não identificado';

    return res.status(200).json({
      totalEncontrados: canais.length,
      projectId,
      canais,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
