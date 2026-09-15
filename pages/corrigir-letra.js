import { useState } from 'react';

export default function CorrigirLetra() {
  const [medleyId, setMedleyId] = useState('');
  const [indice, setIndice] = useState('0');
  const [letra, setLetra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  async function enviar() {
    setErro(null);
    setResultado(null);
    if (!medleyId) return setErro('Cole o ID do medley');
    if (!letra.trim()) return setErro('Cole a letra corrigida');

    setEnviando(true);
    try {
      const res = await fetch('/api/medley-diagnosticar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medleyId, indice, novaLetra: letra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResultado(data.mensagem);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container">
      <h1>Corrigir letra de uma música do medley</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a>
      </p>

      <div className="card">
        <h2>Substituir a letra e realinhar do zero</h2>
        <p style={{ fontSize: 13, color: '#999' }}>
          Use isso quando a legenda dessincronizar — cole aqui a letra real cantada (do{' '}
          <a href="/transcrever" style={{ color: '#4f7cff' }}>/transcrever</a>). Isso reseta essa
          música pra "pendente", forçando alinhar, gerar cena e imagem de novo do zero.
        </p>

        <label>ID do medley</label>
        <input type="text" value={medleyId} onChange={(e) => setMedleyId(e.target.value)} placeholder="Ex: z7vWNYQ1tQASeLwQiQKA" />

        <label>Índice da música (0 = primeira, 1 = segunda, etc.)</label>
        <input type="text" value={indice} onChange={(e) => setIndice(e.target.value)} />

        <label>Letra corrigida</label>
        <textarea
          value={letra}
          onChange={(e) => setLetra(e.target.value)}
          placeholder="[Verse]&#10;..."
          style={{ minHeight: 300, fontFamily: 'monospace', fontSize: 13 }}
        />

        <button disabled={enviando} onClick={enviar} style={{ marginTop: 12 }}>
          {enviando && <span className="spinner" />}
          {enviando ? 'Enviando...' : 'Aplicar correção'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {resultado && <div className="result-box">{resultado}</div>}
      </div>
    </div>
  );
}
