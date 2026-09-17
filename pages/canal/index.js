// pages/canal/index.js
//
// Lista todos os canais criados, cada um levando pro painel /canal/[id].
// É o "meio de campo" pra quando você não sabe o ID de cor.

import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function ListaCanais() {
  const router = useRouter();
  const [canais, setCanais] = useState(null);

  useEffect(() => {
    fetch("/api/canais/listar")
      .then((r) => r.json())
      .then((data) => setCanais(data.canais || []))
      .catch(() => setCanais([]));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Meus canais</h1>
          <button
            onClick={() => router.push("/novo-canal")}
            className="text-sm text-blue-600 underline"
          >
            + Criar novo canal
          </button>
        </div>

        {canais === null && <p className="text-gray-400 text-sm">Carregando...</p>}
        {canais?.length === 0 && (
          <p className="text-gray-400 text-sm">Nenhum canal criado ainda.</p>
        )}

        <div className="space-y-2">
          {canais?.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/canal/${c.id}`)}
              className="w-full text-left border rounded-lg p-4 hover:bg-gray-50"
            >
              <p className="font-medium">{c.nome}</p>
              <p className="text-xs text-gray-500">{c.status}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
