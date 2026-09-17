// pages/api/canais/criar.js
//
// Cria o documento inicial do canal na coleção "canais" do Firestore.
// SUPOSIÇÃO: você tem um lib/firebase-admin.js exportando `db` (firebase-admin/firestore).
// Se seu projeto usa outro caminho/nome, ajusta o import abaixo.

import { db } from "../../../lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { dados } = req.body;

    if (!dados?.nome || !dados?.nicho) {
      return res.status(400).json({ error: "Nome e nicho são obrigatórios" });
    }

    const docRef = await db.collection("canais").add({
      nome: dados.nome,
      nicho: dados.nicho,
      formato: dados.formato,
      contaGoogle: dados.contaGoogle || null,
      status: "em_configuracao",
      criadoEm: new Date().toISOString(),
    });

    return res.status(200).json({ canalId: docRef.id });
  } catch (err) {
    console.error("Erro ao criar canal:", err);
    return res.status(500).json({ error: "Erro interno ao criar canal" });
  }
}
