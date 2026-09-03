import { useState } from 'react';

const STEPS = [
  { key: 'script', label: '1. Roteiro' },
  { key: 'voice', label: '2. Narração' },
  { key: 'visual', label: '3. Imagens/Vídeo' },
  { key: 'assemble', label: '4. Montagem' },
  { key: 'thumbnail', label: '5. Thumbnail' },
  { key: 'publish', label: '6. Publicar' },
];

export default function Home() {
  const [tema, setTema] = useState('');
  const [estilo, setEstilo] = useState('realista');
  const [formato, setFormato] = useState('longo');

  const [status, setStatus] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);

  async function runStep(key, endpoint, body) {
    setLoading(key);
    setStatus((s) => ({ ...s, [key]: null }));
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na etapa');
      setResults((r) => ({ ...r, [key]: data }));
      setStatus((s) => ({ ...s, [key]: 'ok' }));
      return data;
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: 'error' }));
      setResults((r) => ({ ...r, [key]: { error: err.message } }));
      return null;
    } finally {
      setLoading(null);
    }
  }

  const generateScript = () =>
    runStep('script', '/api/generate-script', { tema, estilo, formato });

  const generateVoice = () =>
    runStep('voice', '/api/generate-voice', {
      texto: results.script?.narracao || '',
    });

  const generateVisual = () =>
    runStep('visual', '/api/generate-visual', {
      cenas: results.script?.cenas || [],
      estilo,
    });

  const assembleVideo = () =>
    runStep('assemble', '/api/assemble-video', {
      audioUrl: results.voice?.audioUrl,
      cenas: results.visual?.arquivos,
      formato,
    });

  const generateThumbnail = () =>
    runStep('thumbnail', '/api/generate-thumbnail', {
      tema,
      titulo: results.script?.titulo,
      estilo,
    });

  const publish = () =>
    runStep('publish', '/api/youtube-upload', {
      videoUrl: results.assemble?.videoUrl,
      thumbnailUrl: results.thumbnail?.imageUrl,
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
      tags: results.script?.tags,
    });

  return (
    <div className="container">
      <h1>Youvideo</h1>
      <p className="subtitle">Painel de criação de vídeos bíblicos com IA</p>

      <div className="card">
        <h2>Tema do vídeo</h2>
        <label>Sobre o que é o vídeo?</label>
        <textarea
          placeholder="Ex: A conversão de Paulo no caminho de Damasco"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
        />
        <div className="row">
          <div>
            <label>Estilo visual</label>
            <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
              <option value="realista">Realista</option>
              <option value="desenho">Desenho animado</option>
            </select>
          </div>
          <div>
            <label>Formato</label>
            <select value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="longo">Vídeo longo</option>
              <option value="short">Short</option>
            </select>
          </div>
        </div>
      </div>

      <StepCard
        n={1}
        title="Roteiro (título, descrição, tags, narração)"
        status={status.script}
        loading={loading === 'script'}
        disabled={!tema}
        onRun={generateScript}
        result={results.script}
        renderResult={(r) => <ScriptResult result={r} />}
      />

      <StepCard
        n={2}
        title="Narração (voz)"
        status={status.voice}
        loading={loading === 'voice'}
        disabled={!results.script?.narracao}
        onRun={generateVoice}
        result={results.voice}
      />

      <StepCard
        n={3}
        title="Imagens / vídeo dos personagens e cenas"
        status={status.visual}
        loading={loading === 'visual'}
        disabled={!results.script}
        onRun={generateVisual}
        result={results.visual}
      />

      <StepCard
        n={4}
        title="Montagem final"
        status={status.assemble}
        loading={loading === 'assemble'}
        disabled={!results.voice || !results.visual}
        onRun={assembleVideo}
        result={results.assemble}
      />

      <StepCard
        n={5}
        title="Thumbnail"
        status={status.thumbnail}
        loading={loading === 'thumbnail'}
        disabled={!results.script}
        onRun={generateThumbnail}
        result={results.thumbnail}
      />

      <StepCard
        n={6}
        title="Publicar no YouTube"
        status={status.publish}
        loading={loading === 'publish'}
        disabled={!results.assemble?.videoUrl}
        onRun={publish}
        result={results.publish}
      />
    </div>
  );
}

function StepCard({ n, title, status, loading, disabled, onRun, result, renderResult }) {
  return (
    <div className="card">
      <h2>
        <span className={`step-badge ${status === 'ok' ? 'done' : ''}`}>{n}</span>
        {title}
        {status && (
          <span className={`status ${status}`}>
            {status === 'ok' ? 'pronto' : 'erro'}
          </span>
        )}
      </h2>
      <button disabled={disabled || loading} onClick={onRun}>
        {loading ? 'Gerando...' : 'Executar etapa'}
      </button>
      {result && result.error && (
        <div className="result-box">Erro: {result.error}</div>
      )}
      {result && !result.error && renderResult && renderResult(result)}
      {result && !result.error && !renderResult && (
        <div className="result-box">{JSON.stringify(result, null, 2)}</div>
      )}
    </div>
  );
}

function ScriptResult({ result }) {
  return (
    <div className="result-box" style={{ whiteSpace: 'normal' }}>
      <p><b>Título:</b> {result.titulo}</p>
      <p><b>Descrição:</b> {result.descricao}</p>
      <p><b>Tags:</b> {(result.tags || []).join(', ')}</p>
      <p><b>Narração:</b></p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{result.narracao}</p>
      <p><b>Cenas ({(result.cenas || []).length}):</b></p>
      <ol>
        {(result.cenas || []).map((c, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <i>{c.descricao}</i>
            {c.textoNarrado && <div style={{ color: '#999' }}>"{c.textoNarrado}"</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
