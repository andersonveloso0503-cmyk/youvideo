// pages/canal/[canalId].js
//
// Painel do dia a dia de um canal: adicionar temas na fila e acompanhar
// o status de cada vídeo (pendente -> roteiro_ok -> voz_ok -> imagens_ok ->
// animando -> montando -> concluido, ou erro).
//
// Acesso: /canal/SEU_CANAL_ID
// Pra trocar de canal, use o seletor no topo (lista todos os canais).

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";

const ROTULOS_STATUS = {
  pendente: "Na fila",
  roteiro_ok: "Roteiro pronto",
  voz_ok: "Narração pronta",
  imagens_ok: "Imagens prontas",
  animando: "Animando cenas",
  montando: "Montando vídeo",
  concluido: "Publicado ✅",
  erro: "Erro ❌",
};

export default function PainelCanal() {
  const router = useRouter();
  const { canalId } = router.query;

  const [canal, setCanal] = useState(null);
  const [listaCanais, setListaCanais] = useState([]);
  const [itensFila, setItensFila] = useState([]);
  const [tema, setTema] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erroFila, setErroFila] = useState("");
  const [reformatando, setReformatando] = useState({}); // { [itemId]: { renderId, status, videoUrl } }

  const carregarCanal = useCallback(async () => {
    if (!canalId) return;
    try {
      const res = await fetch(`/api/canais/detalhe?canalId=${canalId}`);
      const data = await res.json();
      if (res.ok) setCanal(data);
    } catch {
      // silencioso
    }
  }, [canalId]);

  const carregarFila = useCallback(async () => {
    if (!canalId) return;
    try {
      const res = await fetch(`/api/canais/fila-listar?canalId=${canalId}`);
      const data = await res.json();
      if (res.ok) {
        setItensFila(data.itens);
        setErroFila("");
      } else {
        setErroFila(data.error || "Erro ao carregar a fila");
      }
    } catch (e) {
      setErroFila(e.message);
    }
  }, [canalId]);

  const carregarListaCanais = useCallback(async () => {
    try {
      const res = await fetch("/api/canais/listar");
      const data = await res.json();
      if (res.ok) setListaCanais(data.canais);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    carregarListaCanais();
  }, [carregarListaCanais]);

  useEffect(() => {
    carregarCanal();
    carregarFila();
  }, [carregarCanal, carregarFila]);

  // Atualiza a lista da fila automaticamente a cada 10s, pra acompanhar
  // o progresso sem precisar ficar apertando F5.
  useEffect(() => {
    const intervalo = setInterval(carregarFila, 10000);
    return () => clearInterval(intervalo);
  }, [carregarFila]);

  async function adicionarTema() {
    if (!tema.trim()) return;
    setEnviando(true);
    setMensagem("");
    try {
      const res = await fetch("/api/canais/fila-adicionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canalId, tema }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro desconhecido");
      setMensagem("Tema adicionado na fila!");
      setTema("");
      carregarFila();
    } catch (e) {
      setMensagem(`Erro: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  }

  // Processa manualmente 1 passo da fila (sem precisar esperar o cron) —
  // útil pra testar ou pra dar um empurrão quando quiser ver algo pronto rápido.
  async function processarAgora() {
    setProcessando(true);
    setMensagem("");
    try {
      const res = await fetch(`/api/fila/${canalId}`);
      const data = await res.json();
      if (data.mensagem) {
        setMensagem(data.mensagem);
      } else if (data.error) {
        setMensagem(`Erro: ${data.error}`);
      } else {
        setMensagem(`Processado: passo "${data.statusAnterior}" concluído.`);
      }
      carregarFila();
    } catch (e) {
      setMensagem(`Erro: ${e.message}`);
    } finally {
      setProcessando(false);
    }
  }

  async function reformatarParaVertical(itemId) {
    setReformatando((prev) => ({ ...prev, [itemId]: { status: "enviando" } }));
    try {
      const res = await fetch("/api/reformatar-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colecao: "fila",
          itemId,
          novoFormato: "short",
          ambiente: canal?.config?.shotstackAmbiente || "production",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao reformatar");
      setReformatando((prev) => ({
        ...prev,
        [itemId]: { status: "processando", renderId: data.renderId },
      }));
    } catch (e) {
      setReformatando((prev) => ({ ...prev, [itemId]: { status: "erro", erro: e.message } }));
    }
  }

  async function verificarStatusReformatacao(itemId) {
    const info = reformatando[itemId];
    if (!info?.renderId) return;
    try {
      const ambiente = canal?.config?.shotstackAmbiente || "production";
      const res = await fetch(`/api/assemble-video?id=${info.renderId}&ambiente=${ambiente}`);
      const data = await res.json();
      if (data.status === "done") {
        setReformatando((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], status: "pronto", videoUrl: data.videoUrl },
        }));
      } else if (data.status === "failed") {
        setReformatando((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], status: "erro", erro: data.erro || "Falha na montagem" },
        }));
      } else {
        setReformatando((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], status: "processando" },
        }));
      }
    } catch (e) {
      setReformatando((prev) => ({ ...prev, [itemId]: { ...prev[itemId], status: "erro", erro: e.message } }));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Canal
            </label>
            <button
              onClick={() => router.push("/novo-canal")}
              className="text-sm text-blue-600 underline"
            >
              + Criar novo canal
            </button>
          </div>
          <select
            className="input"
            value={canalId || ""}
            onChange={(e) => router.push(`/canal/${e.target.value}`)}
          >
            {!canalId && <option value="">Selecione um canal</option>}
            {listaCanais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} {c.status !== "ativo" ? `(${c.status})` : ""}
              </option>
            ))}
          </select>
        </div>

        {canal && (
          <div>
            <h1 className="text-2xl font-semibold">{canal.nome}</h1>
            <p className="text-gray-500 text-sm">{canal.nicho}</p>
          </div>
        )}

        <div className="border rounded-xl p-4 space-y-3">
          <p className="font-medium text-sm text-gray-700">Adicionar novo tema</p>
          <input
            className="input"
            placeholder="Ex: A Parábola do Filho Pródigo"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarTema()}
          />
          <button
            onClick={adicionarTema}
            disabled={!tema.trim() || enviando || !canalId}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
          >
            {enviando ? "Adicionando..." : "Adicionar na fila"}
          </button>
        </div>

        <button
          onClick={processarAgora}
          disabled={processando || !canalId}
          className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold disabled:opacity-50"
        >
          {processando ? "Processando..." : "Processar próximo passo agora"}
        </button>

        {mensagem && (
          <p className="text-sm text-gray-600 bg-gray-100 rounded-lg p-3 break-all">
            {mensagem}
          </p>
        )}

        <div>
          <p className="font-medium text-sm text-gray-700 mb-2">Fila deste canal</p>
          {erroFila && (
            <p className="text-sm text-red-600 break-all mb-2">{erroFila}</p>
          )}
          {itensFila.length === 0 && !erroFila && (
            <p className="text-sm text-gray-400">Nenhum item na fila ainda.</p>
          )}
          <div className="space-y-2">
            {itensFila.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-3 flex items-center justify-between text-sm"
              >
                <div>
                  <p className="font-medium">{item.tema}</p>
                  {item.erro && (
                    <p className="text-red-600 text-xs mt-1">{item.erro}</p>
                  )}
                  {item.youtubeVideoId && (
                    <a
                      href={`https://youtube.com/watch?v=${item.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 text-xs underline"
                    >
                      Ver no YouTube
                    </a>
                  )}

                  {item.status === "concluido" && (
                    <div className="mt-2">
                      {!reformatando[item.id] && (
                        <button
                          onClick={() => reformatarParaVertical(item.id)}
                          className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700"
                        >
                          Reformatar pra vertical (TikTok/Kwai)
                        </button>
                      )}
                      {reformatando[item.id]?.status === "enviando" && (
                        <p className="text-xs text-gray-400">Enviando pedido de remontagem...</p>
                      )}
                      {reformatando[item.id]?.status === "processando" && (
                        <button
                          onClick={() => verificarStatusReformatacao(item.id)}
                          className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700"
                        >
                          Ainda montando — clique pra verificar de novo
                        </button>
                      )}
                      {reformatando[item.id]?.status === "erro" && (
                        <p className="text-xs text-red-600">
                          Erro: {reformatando[item.id].erro}
                        </p>
                      )}
                      {reformatando[item.id]?.status === "pronto" && (
                        <a
                          href={reformatando[item.id].videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 inline-block"
                        >
                          Vídeo vertical pronto — baixar
                        </a>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    item.status === "concluido"
                      ? "bg-green-100 text-green-700"
                      : item.status === "erro"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {ROTULOS_STATUS[item.status] || item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          font-size: 1rem;
        }
        .input:focus {
          outline: none;
          border-color: #2563eb;
        }
      `}</style>
    </div>
  );
}
