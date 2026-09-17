// pages/novo-canal.js
//
// Wizard "Novo Canal" — guia a criação de um canal dark do zero:
// dados básicos -> conectar YouTube -> identidade visual -> orçamento -> ativar.
//
// SUPOSIÇÃO: projeto Next.js com Pages Router e Tailwind já configurado
// (mesmo padrão que /musica, /musica-fila, /medley). Se seu projeto usa
// App Router (pasta /app), me avisa que eu converto.

import { useState, useEffect } from "react";
import { useRouter } from "next/router";

const STEPS = [
  "Dados do canal",
  "Conectar YouTube",
  "Identidade visual",
  "Orçamento e cadência",
  "Revisão",
];

export default function NovoCanal() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [canalId, setCanalId] = useState(null);

  const [dados, setDados] = useState({
    nome: "",
    nicho: "",
    formato: "longo_e_shorts", // longo | shorts | longo_e_shorts
    contaGoogle: "",
  });

  const [identidade, setIdentidade] = useState({
    temPersonagem: true,
    personagemNome: "",
    personagemDescricao: "",
    estiloVisual: "",
    vozElevenLabsId: "",
  });

  const [config, setConfig] = useState({
    orcamentoMensal: 250,
    videosAnimadosPorSemana: 1,
    shotstackAmbiente: "sandbox", // sandbox | production
    videosPorDia: 1,
  });

  function atualizar(setFn) {
    return (campo, valor) => setFn((prev) => ({ ...prev, [campo]: valor }));
  }
  const setDado = atualizar(setDados);
  const setIdent = atualizar(setIdentidade);
  const setConf = atualizar(setConfig);

  // Quando a página recarrega vinda da volta do Google (OAuth), o canalId
  // e o "youtube=conectado" vêm como parâmetros na URL — sem isso, o
  // wizard reiniciava sempre no Passo 1 porque o estado do React se perde
  // a cada recarregamento de página.
  useEffect(() => {
    if (!router.isReady) return;
    const { canalId: canalIdDaUrl, youtube } = router.query;
    if (canalIdDaUrl && typeof canalIdDaUrl === "string") {
      setCanalId(canalIdDaUrl);
      if (youtube === "conectado") {
        setStep(2);
      }
    }
  }, [router.isReady, router.query]);

  // Passo 1: cria o documento do canal no Firestore (via API route)
  async function criarCanalBasico() {
    setSaving(true);
    setErro("");
    try {
      const res = await fetch("/api/canais/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados }),
      });
      if (!res.ok) throw new Error("Falha ao salvar canal");
      const data = await res.json();
      setCanalId(data.canalId);
      setStep(1);
    } catch (e) {
      setErro("Não consegui salvar os dados do canal. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }

  // Passo 2: manda pro fluxo OAuth do Google, levando o canalId no state
  function conectarYoutube() {
    if (!canalId) return;
    window.location.href = `/api/youtube/oauth-authorize?canalId=${canalId}`;
  }

  // Passo 3 e 4: salva identidade e config, sem sair da tela
  async function salvarPasso(campo, valor) {
    if (!canalId) return;
    try {
      await fetch("/api/canais/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canalId, campo, valor }),
      });
    } catch (e) {
      // não bloqueia o fluxo, só avisa
      console.error("Falha ao salvar", campo, e);
    }
  }

  async function finalizar() {
    setSaving(true);
    setErro("");
    try {
      await salvarPasso("identidade", identidade);
      await salvarPasso("config", config);
      const res = await fetch("/api/canais/ativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canalId }),
      });
      const data = await res.json();
      setStep(4);
      // guarda a URL do cron pra mostrar na revisão
      setConfig((prev) => ({ ...prev, urlFila: data.urlFila }));
    } catch (e) {
      setErro("Não consegui ativar a automação. Confere os dados e tenta de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-semibold mb-1">Novo canal</h1>
        <p className="text-gray-500 mb-6">
          Passo {step + 1} de {STEPS.length}: {STEPS[step]}
        </p>

        {/* Barra de progresso */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-blue-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {erro && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {erro}
          </div>
        )}

        {/* PASSO 1 */}
        {step === 0 && (
          <div className="space-y-4">
            <Campo label="Nome do canal">
              <input
                className="input"
                value={dados.nome}
                onChange={(e) => setDado("nome", e.target.value)}
                placeholder="Ex: Nova Frequência"
              />
            </Campo>
            <Campo label="Nicho / tema">
              <input
                className="input"
                value={dados.nicho}
                onChange={(e) => setDado("nicho", e.target.value)}
                placeholder="Ex: histórias bíblicas animadas"
              />
            </Campo>
            <Campo label="Formato principal">
              <select
                className="input"
                value={dados.formato}
                onChange={(e) => setDado("formato", e.target.value)}
              >
                <option value="longo">Só vídeos longos</option>
                <option value="shorts">Só Shorts</option>
                <option value="longo_e_shorts">Longos + Shorts</option>
              </select>
            </Campo>
            <Campo label="Conta Google do canal">
              <input
                className="input"
                value={dados.contaGoogle}
                onChange={(e) => setDado("contaGoogle", e.target.value)}
                placeholder="email@gmail.com"
              />
            </Campo>
            <BotaoGrande
              disabled={!dados.nome || !dados.nicho || saving}
              onClick={criarCanalBasico}
            >
              {saving ? "Salvando..." : "Continuar"}
            </BotaoGrande>
          </div>
        )}

        {/* PASSO 2 */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Clique abaixo e faça login com a conta{" "}
              <strong>{dados.contaGoogle || "do canal"}</strong> para autorizar
              a publicação automática no YouTube.
            </p>
            <BotaoGrande onClick={conectarYoutube}>
              Conectar YouTube
            </BotaoGrande>
            <button
              className="text-sm text-gray-400 underline block mx-auto mt-2"
              onClick={() => setStep(2)}
            >
              Já conectei / pular por enquanto
            </button>
          </div>
        )}

        {/* PASSO 3 */}
        {step === 2 && (
          <div className="space-y-4">
            <Campo label="Esse canal tem personagem fixo?">
              <select
                className="input"
                value={identidade.temPersonagem ? "sim" : "nao"}
                onChange={(e) =>
                  setIdent("temPersonagem", e.target.value === "sim")
                }
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </Campo>
            {identidade.temPersonagem && (
              <>
                <Campo label="Nome do personagem">
                  <input
                    className="input"
                    value={identidade.personagemNome}
                    onChange={(e) => setIdent("personagemNome", e.target.value)}
                  />
                </Campo>
                <Campo label="Descrição visual (pra IA manter consistência)">
                  <textarea
                    className="input"
                    rows={3}
                    value={identidade.personagemDescricao}
                    onChange={(e) =>
                      setIdent("personagemDescricao", e.target.value)
                    }
                    placeholder="Ex: homem de 30 anos, túnica bege, cabelo curto..."
                  />
                </Campo>
              </>
            )}
            <Campo label="Estilo visual do canal">
              <input
                className="input"
                value={identidade.estiloVisual}
                onChange={(e) => setIdent("estiloVisual", e.target.value)}
                placeholder="Ex: desenho animado 2D, tons quentes"
              />
            </Campo>
            <Campo label="ID da voz no ElevenLabs">
              <input
                className="input"
                value={identidade.vozElevenLabsId}
                onChange={(e) => setIdent("vozElevenLabsId", e.target.value)}
                placeholder="cole o voice_id"
              />
            </Campo>
            <BotaoGrande onClick={() => setStep(3)}>Continuar</BotaoGrande>
          </div>
        )}

        {/* PASSO 4 */}
        {step === 3 && (
          <div className="space-y-4">
            <Campo label="Orçamento mensal (R$)">
              <input
                type="number"
                className="input"
                value={config.orcamentoMensal}
                onChange={(e) =>
                  setConf("orcamentoMensal", Number(e.target.value))
                }
              />
            </Campo>
            <Campo label="Vídeos animados por semana">
              <input
                type="number"
                className="input"
                value={config.videosAnimadosPorSemana}
                onChange={(e) =>
                  setConf("videosAnimadosPorSemana", Number(e.target.value))
                }
              />
            </Campo>
            <Campo label="Vídeos publicados por dia (fila)">
              <input
                type="number"
                className="input"
                value={config.videosPorDia}
                onChange={(e) =>
                  setConf("videosPorDia", Number(e.target.value))
                }
              />
            </Campo>
            <Campo label="Ambiente Shotstack">
              <select
                className="input"
                value={config.shotstackAmbiente}
                onChange={(e) => setConf("shotstackAmbiente", e.target.value)}
              >
                <option value="sandbox">Sandbox (teste, com marca d'água)</option>
                <option value="production">Produção (paga, sem marca d'água)</option>
              </select>
            </Campo>
            <BotaoGrande disabled={saving} onClick={finalizar}>
              {saving ? "Ativando..." : "Criar canal e ativar automação"}
            </BotaoGrande>
          </div>
        )}

        {/* PASSO 5 */}
        {step === 4 && (
          <div className="space-y-4 text-center">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-semibold">Canal criado!</h2>
            <p className="text-gray-600">
              Cadastre esta URL no cron-job.org pra ativar a fila automática:
            </p>
            <div className="bg-gray-100 rounded-lg p-3 text-sm break-all font-mono">
              {config.urlFila || "URL será exibida após ativar"}
            </div>
            <BotaoGrande onClick={() => router.push("/")}>
              Ir para o painel
            </BotaoGrande>
          </div>
        )}
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

function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function BotaoGrande({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 rounded-xl bg-blue-600 text-white font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition"
    >
      {children}
    </button>
  );
}
