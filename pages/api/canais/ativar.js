// pages/api/canais/ativar.js
//
// Marca o canal como "ativo" e devolve a URL do endpoint de fila
// que deve ser cadastrada no cron-job.org.
//
// SUPOSIÇÃO: existe (ou vai existir) um endpoint genérico
// /api/fila/[canalId] que processa 1 vídeo daquele canal por chamada
// — o mesmo padrão do /api/musica-fila-processar, só que parametrizado
// por canal em vez de fixo. Você provavelmente vai reaproveitar a lógica
// que já tem em vez de duplicar código.

import { db } from "../../../lib/firebase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { canalId } = req.body;
    if (!canalId) {
      return res.status(400).json({ error: "canalId é obrigatório" });
    }

    await db.collection("canais").doc(canalId).set(
      { status: "ativo", ativadoEm: new Date().toISOString() },
      { merge: true }
    );

    // Base URL do seu domínio em produção — ajuste se for diferente
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://youvideors2.vercel.app";
    const urlFila = `${baseUrl}/api/fila/${canalId}`;

    return res.status(200).json({ ok: true, urlFila });
  } catch (err) {
    console.error("Erro ao ativar canal:", err);
    return res.status(500).json({ error: "Erro interno ao ativar canal" });
  }
}
