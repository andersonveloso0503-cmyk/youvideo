import { useState, useEffect } from 'react';

function BrollSearch() {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(null);

  async function buscar() {
    if (!query) return;
    setBuscando(true);
    setErro(null);
    try {
      const res = await fetch('/api/stock-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResultados(data.resultados || []);
    } catch (err) {
      setErro(err.message);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="card">
      <h2>Material de apoio (b-roll, banco livre de direitos)</h2>
      <label>Buscar (ex: deserto, mar da Galileia, ruínas antigas)</label>
      <div className="row">
        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: paisagem deserto"
          />
        </div>
      </div>
      <button disabled={buscando || !query} onClick={buscar}>
        {buscando ? 'Buscando...' : 'Buscar'}
      </button>
      {erro && <div className="result-box">Erro: {erro}</div>}
      {resultados && (
        <div className="result-box">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {resultados.map((r) => (
              <a key={r.id} href={r.videoUrl} target="_blank" rel="noreferrer" style={{ width: 120 }}>
                <img src={r.preview} alt="preview" style={{ width: '100%', borderRadius: 6 }} />
              </a>
            ))}
          </div>
          {!resultados.length && <div style={{ color: '#999' }}>Nada encontrado pra esse termo.</div>}
        </div>
      )}
    </div>
  );
}

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
  const [duracaoDesejada, setDuracaoDesejada] = useState('420');
  const [vozId, setVozId] = useState('');
  const [vozes, setVozes] = useState(null);

  useEffect(() => {
    fetch('/api/list-voices')
      .then((r) => r.json())
      .then((data) => setVozes(data.vozes || []))
      .catch(() => setVozes([]));
  }, []);

  const [status, setStatus] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);
  const [duracaoAlvo, setDuracaoAlvo] = useState(undefined);

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
    runStep('script', '/api/generate-script', { tema, estilo, formato, duracaoDesejada });

  const generateVoice = () =>
    runStep('voice', '/api/generate-voice', {
      texto: results.script?.narracao || '',
      vozId,
    });

  const generateVisual = async () => {
    const numCenas = (results.script?.cenas || []).length || 1;
    const ultimaPalavra = (results.voice?.palavras || []).filter((p) => p.end != null).pop();
    const duracaoAlvo = ultimaPalavra ? (ultimaPalavra.end + 0.4) / numCenas : undefined;

    await runStep('visual', '/api/generate-visual', {
      cenas: results.script?.cenas || [],
      estilo,
      formato,
    });
    // guarda a duração calculada pra usar depois, quando o usuário mandar animar
    setDuracaoAlvo(duracaoAlvo);
  };

  const animateScenes = async () => {
    const primeiro = await runStep('visual', '/api/animate-scenes', {
      arquivos: results.visual?.arquivos || [],
      formato,
      duracaoAlvo,
    });
    if (!primeiro) return;

    const pendentes = (primeiro.arquivos || []).filter((a) => a.klingTaskId);
    if (!pendentes.length) return;

    setLoading('visual');
    let tentativas = 0;
    while (tentativas < 90) {
      await new Promise((r) => setTimeout(r, 5000));
      let todasProntas = true;

      for (const arquivo of pendentes) {
        if (arquivo.videoUrl || arquivo.falhouAnimacao) continue;
        const check = await fetch(`/api/check-kling-status?taskId=${arquivo.klingTaskId}`).then((r) => r.json());
        if (check.status === 'done') {
          arquivo.videoUrl = check.videoUrl;
        } else if (check.status === 'failed') {
          arquivo.falhouAnimacao = true;
          arquivo.avisoVideo = check.error;
        } else {
          todasProntas = false;
        }
      }

      setResults((r) => ({ ...r, visual: { arquivos: primeiro.arquivos } }));
      if (todasProntas) break;
      tentativas++;
    }
    setLoading(null);
  };

  const assembleVideo = async () => {
    const primeira = await runStep('assemble', '/api/assemble-video', {
      audioUrl: results.voice?.audioUrl,
      cenas: results.visual?.arquivos,
      formato,
      palavras: results.voice?.palavras,
    });
    if (!primeira || !primeira.renderId) return;

    setLoading('assemble');
    let tentativas = 0;
    while (tentativas < 40) {
      await new Promise((r) => setTimeout(r, 5000));
      const check = await fetch(`/api/assemble-video?id=${primeira.renderId}`).then((r) => r.json());
      if (check.status === 'done') {
        setResults((r) => ({ ...r, assemble: { ...primeira, ...check } }));
        setStatus((s) => ({ ...s, assemble: 'ok' }));
        break;
      }
      if (check.status === 'failed') {
        setResults((r) => ({ ...r, assemble: { error: `A montagem falhou na Shotstack: ${check.erro || 'motivo não informado'}` } }));
        setStatus((s) => ({ ...s, assemble: 'error' }));
        break;
      }
      setResults((r) => ({ ...r, assemble: { ...primeira, status: check.status } }));
      tentativas++;
    }
    setLoading(null);
  };

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

  const publishTiktok = () =>
    runStep('publishTiktok', '/api/tiktok-upload', {
      videoUrl: results.assemble?.videoUrl,
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
    });

  const salvarProjeto = () =>
    runStep('salvar', '/api/save-project', {
      tema,
      estilo,
      formato,
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
      videoUrl: results.assemble?.videoUrl,
      thumbnailUrl: results.thumbnail?.imageUrl,
    });

  return (
    <div className="container">
      <h1>Youvideo</h1>
      <p className="subtitle">
        Painel de criação de vídeos bíblicos com IA · <a href="/agendar" style={{ color: '#4f7cff' }}>Agendar Vídeos</a> ·{' '}
        <a href="/projetos" style={{ color: '#4f7cff' }}>Meus Projetos</a>
      </p>

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
        <label>Voz do narrador</label>
        <select value={vozId} onChange={(e) => setVozId(e.target.value)}>
          <option value="">Padrão</option>
          {vozes?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome} {v.genero ? `(${v.genero})` : ''}
            </option>
          ))}
        </select>
        {vozId && vozes?.find((v) => v.id === vozId)?.preview && (
          <audio
            src={vozes.find((v) => v.id === vozId).preview}
            controls
            style={{ width: '100%', marginTop: 8 }}
          />
        )}
        {vozes === null && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Carregando vozes...</div>}
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
        renderResult={(r) => <VoiceResult result={r} />}
      />

      <StepCard
        n={3}
        title="Imagens dos personagens e cenas"
        status={status.visual}
        loading={loading === 'visual'}
        disabled={!results.script}
        onRun={generateVisual}
        result={results.visual}
        renderResult={(r) => (
          <>
            <VisualResult result={r} />
            {r.arquivos?.some((a) => a.imageUrl && !a.klingTaskId && !a.videoUrl) && (
              <button onClick={animateScenes} disabled={loading === 'visual'}>
                {loading === 'visual' ? 'Animando...' : 'Animar essas cenas (gasta crédito Kling)'}
              </button>
            )}
          </>
        )}
      />

      <StepCard
        n={4}
        title="Montagem final"
        status={status.assemble}
        loading={loading === 'assemble'}
        disabled={!results.voice || !results.visual}
        onRun={assembleVideo}
        result={results.assemble}
        renderResult={(r) => <AssembleResult result={r} />}
      />

      <StepCard
        n={5}
        title="Thumbnail"
        status={status.thumbnail}
        loading={loading === 'thumbnail'}
        disabled={!results.script}
        onRun={generateThumbnail}
        result={results.thumbnail}
        renderResult={(r) => <ThumbnailResult result={r} />}
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

      <StepCard
        n={7}
        title="Publicar no TikTok"
        status={status.publishTiktok}
        loading={loading === 'publishTiktok'}
        disabled={!results.assemble?.videoUrl}
        onRun={publishTiktok}
        result={results.publishTiktok}
      />

      <div className="card">
        <h2>Salvar este projeto</h2>
        <button disabled={!results.script || loading === 'salvar'} onClick={salvarProjeto}>
          {loading === 'salvar' ? 'Salvando...' : 'Salvar projeto'}
        </button>
        {status.salvar === 'ok' && <div className="result-box">Salvo! Vê em "Meus Projetos" no topo da página.</div>}
        {status.salvar === 'error' && <div className="result-box">Erro: {results.salvar?.error}</div>}
      </div>

      <BrollSearch />
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

async function baixarArquivo(url, nomeArquivo) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    alert('Não deu pra baixar automaticamente. Segure o dedo em cima do vídeo/imagem e escolha "Salvar" no menu que aparecer.');
  }
}

function AssembleResult({ result }) {
  if (!result.videoUrl) {
    return <div className="result-box">{result.status || 'processando...'}</div>;
  }
  return (
    <div className="result-box">
      <video src={result.videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
      <div style={{ marginTop: 10 }}>
        <button style={{ marginTop: 0 }} onClick={() => baixarArquivo(result.videoUrl, 'youvideo.mp4')}>
          Baixar vídeo completo
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
        Baixe e suba manualmente no Kwai ou em qualquer outro app.
      </div>
    </div>
  );
}

function VisualResult({ result }) {
  return (
    <div className="result-box">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {(result.arquivos || []).map((a, i) => (
          <div key={i} style={{ width: 150 }}>
            {a.videoUrl ? (
              <video src={a.videoUrl} controls style={{ width: '100%', borderRadius: 6 }} />
            ) : a.imageUrl ? (
              <img src={a.imageUrl} alt={a.cena} style={{ width: '100%', borderRadius: 6 }} />
            ) : a.erro ? (
              <div style={{ color: '#ff9d9d', fontSize: 11 }}>{a.erro}</div>
            ) : (
              <div style={{ color: '#999' }}>{a.status || 'sem imagem'}</div>
            )}
            {a.klingTaskId && !a.videoUrl && !a.falhouAnimacao && (
              <div style={{ fontSize: 11, color: '#4f7cff' }}>animando...</div>
            )}
            {a.avisoVideo && (
              <div style={{ fontSize: 11, color: '#ff9d9d' }}>{a.avisoVideo}</div>
            )}
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{a.cena}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThumbnailResult({ result }) {
  return (
    <div className="result-box">
      {result.imageUrl ? (
        <>
          <img src={result.imageUrl} alt="thumbnail" style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          <div style={{ marginTop: 10 }}>
            <button style={{ marginTop: 0 }} onClick={() => baixarArquivo(result.imageUrl, 'thumbnail.png')}>
              Baixar thumbnail
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: '#999' }}>{result.status || 'sem imagem'}</div>
      )}
    </div>
  );
}
function VoiceResult({ result }) {
  if (!result.audioUrl) return <div className="result-box">{result.status || 'processando...'}</div>;
  return (
    <div className="result-box">
      <audio src={result.audioUrl} controls style={{ width: '100%' }} />
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
        {(result.palavras || []).length} palavras com timing sincronizado
      </div>
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
