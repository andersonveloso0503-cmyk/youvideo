import { useEffect, useState } from 'react';

const STATUS_LABEL = {
  pendente: 'Na fila',
  roteiro_ok: 'Roteiro pronto',
  voz_ok: 'Narração pronta',
  imagens_ok: 'Imagens prontas',
  animando: 'Animando cenas...',
  montando: 'Montando vídeo...',
  concluido: 'Concluído ✅',
  erro: 'Erro ❌',
};

export default function Agendar() {
  const [tema, setTema] = useState('');
  const [estilo, setEstilo] = useState('realista');
  const [formato, setFormato] = useState('longo');
  const [duracaoDesejada, setDuracaoDesejada] = useState('420');
  const [fila, setFila] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function carregarFila() {
    const data = await fetch('/api/fila-listar').then((r) => r.json());
    setFila(data.fila || []);
  }

  useEffect(() => {
    carregarFila();
    const intervalo = setInterval(carregarFila, 15000);
    return () => clearInterval(intervalo);
  }, []);

  async function adicionar() {
    if (!tema) return;
    setEnviando(true);
    await fetch('/api/fila-adicionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tema, estilo, formato, duracaoDesejada }),
    });
    setTema('');
    setEnviando(false);
    carregarFila();
  }

  return (
    <div className="container">
      <h1>Agendar Vídeos</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← voltar pro painel</a> ·{' '}
        <a href="/projetos" style={{ color: '#4f7cff' }}>Meus Projetos</a>
      </p>

      <div className="card">
        <h2>Adicionar à fila</h2>
        <label>Tema do vídeo</label>
        <textarea value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex: A conversão de Paulo" />
        <div className="row">
          <div>
            <label>Estilo</label>
            <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
              <option value="realista">Realista</option>
              <option value="desenho">Desenho animado</option>
            </select>
          </div>
          <div>
            <label>Formato</label>
            <select
              value={formato}
              onChange={(e) => {
                setFormato(e.target.value);
                setDuracaoDesejada(e.target.value === 'short' ? '180' : '420');
              }}
            >
              <option value="longo">Vídeo longo</option>
              <option value="short">Short</option>
            </select>
          </div>
        </div>
        <label>Duração desejada</label>
        <select value={duracaoDesejada} onChange={(e) => setDuracaoDesejada(e.target.value)}>
          {formato === 'short' ? (
            <>
              <option value="60">Até 1 minuto</option>
              <option value="120">Até 2 minutos</option>
              <option value="180">Até 3 minutos (máximo do YouTube)</option>
            </>
          ) : (
            <>
              <option value="420">7 minutos</option>
              <option value="600">10 minutos</option>
              <option value="900">15 minutos</option>
            </>
          )}
        </select>
        <button disabled={!tema || enviando} onClick={adicionar}>
          {enviando ? 'Adicionando...' : 'Adicionar à fila'}
        </button>
      </div>

      <div className="card">
        <h2>Fila (atualiza a cada 15s)</h2>
        {!fila && <div>Carregando...</div>}
        {fila?.length === 0 && <div style={{ color: '#999' }}>Fila vazia.</div>}
        {fila?.map((item) => (
          <div key={item.id} style={{ borderBottom: '1px solid #262a33', padding: '10px 0' }}>
            <div style={{ fontWeight: 600 }}>{item.tema}</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {item.estilo} · {item.formato} · {STATUS_LABEL[item.status] || item.status}
              {item.erro && ` — ${item.erro}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
