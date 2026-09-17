import { useState, useEffect } from 'react';

const TEMAS_SUGERIDOS = [
  'Paz, direção e fortalecimento para o dia',
  'Proteção e livramento divino',
  'Gratidão, paz e esperança',
  'Sabedoria e direção de Deus',
  'Bênçãos e milagres para sua vida',
  'Força para enfrentar os desafios',
  'Cura e saúde',
  'Ansiedade e paz mental',
];

export default function Oracao() {
  const estilo = 'realista';
  const [temaEscolhido, setTemaEscolhido] = useState(TEMAS_SUGERIDOS[0]);
  const [temaCustom, setTemaCustom] = useState('');
  const [usarCustom, setUsarCustom] = useState(false);
  const tema = usarCustom ? temaCustom : temaEscolhido;

  const [duracaoDesejada, setDuracaoDesejada] = useState('420'); // 7 min, dentro da faixa 5-10 min
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
    runStep('script', '/api/generate-oracao-script', { tema, duracaoDesejada });

  const generateVoice = () =>
    runStep('voice', '/api/generate-voice', {
      texto: results.script?.narracao || '',
      vozId,
    });

  // Só 1 imagem (a descrição vem pronta do roteiro) — sem lista de cenas,
  // sem opção de animar: é pra ficar parada em loop atrás da narração.
  const generateVisual = () =>
    runStep('visual', '/api/generate-visual', {
      cenas: [{ descricao: results.script?.imagemDescricao || '', textoNarrado: '' }],
      estilo,
      formato: 'longo',
    });

  const assembleVideo = async () => {
    const primeira = await runStep('assemble', '/api/assemble-video', {
      audioUrl: results.voice?.audioUrl,
      cenas: results.visual?.arquivos,
      formato: 'longo',
      palavras: results.voice?.palavras,
      marca: 'Em Nome de Jesus',
    });
    if (!primeira || !primeira.renderId) return;

    setLoading('assemble');
    let tentativas = 0;
    while (tentativas < 60) {
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
      thumbnailTitulo: results.script?.thumbnailTitulo,
      thumbnailSubtitulo: results.script?.thumbnailSubtitulo,
    });

  const publish = () =>
    runStep('publish', '/api/youtube-upload', {
      videoUrl: results.assemble?.videoUrl,
      thumbnailUrl: results.thumbnail?.imageUrl,
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
      tags: results.script?.tags,
    });

  const salvarProjeto = () =>
    runStep('salvar', '/api/save-project', {
      tema,
      estilo,
      formato: 'longo',
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
      videoUrl: results.assemble?.videoUrl,
      thumbnailUrl: results.thumbnail?.imageUrl,
      audioUrl: results.voice?.audioUrl,
      cenas: results.visual?.arquivos,
      palavras: results.voice?.palavras,
    });

  return (
    <div className="container">
      <h1>Orações Matinais</h1>
      <p className="subtitle">Oração calma com 1 imagem em loop — pra ouvir de manhã.</p>
      <p style={{ marginTop: -8 }}>
        <a href="/" style={{ color: '#4f7cff', fontSize: 13 }}>← voltar pro painel principal</a>
      </p>

      <div className="card">
        <h2>Escolha o tema da oração</h2>
        <label>Tema</label>
        <select
          value={usarCustom ? '__custom__' : temaEscolhido}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setUsarCustom(true);
            } else {
              setUsarCustom(false);
              setTemaEscolhido(e.target.value);
            }
          }}
        >
          {TEMAS_SUGERIDOS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="__custom__">Outro tema (digitar)</option>
        </select>

        {usarCustom && (
          <>
            <label>Descreva o tema/intenção</label>
            <textarea
              placeholder="Ex: oração pra quem está desempregado"
              value={temaCustom}
              onChange={(e) => setTemaCustom(e.target.value)}
            />
          </>
        )}

        <label>Duração desejada</label>
        <select value={duracaoDesejada} onChange={(e) => setDuracaoDesejada(e.target.value)}>
          <option value="300">5 minutos</option>
          <option value="420">7 minutos</option>
          <option value="600">10 minutos</option>
          <option value="1200">20 minutos (formato dos vídeos com mais alcance)</option>
          <option value="1500">25 minutos</option>
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
      </div>

      <Etapa
        n={1}
        title="Roteiro da oração"
        status={status.script}
        loading={loading === 'script'}
        onRun={generateScript}
        disabled={!tema}
        result={results.script}
        renderResult={(r) => (
          <div className="result-box" style={{ whiteSpace: 'normal' }}>
            <p><b>Título:</b> {r.titulo}</p>
            <p><b>Imagem de fundo:</b> {r.imagemDescricao}</p>
            <p><b>Oração ({(r.narracao || '').length} caracteres)</b></p>
            <textarea
              value={r.narracao || ''}
              onChange={(e) => setResults((res) => ({ ...res, script: { ...res.script, narracao: e.target.value } }))}
              style={{ width: '100%', minHeight: 200, fontFamily: 'inherit', fontSize: 'inherit' }}
            />
          </div>
        )}
      />

      <Etapa
        n={2}
        title="Narração (voz)"
        status={status.voice}
        loading={loading === 'voice'}
        onRun={generateVoice}
        disabled={!results.script?.narracao}
        result={results.voice}
        renderResult={(r) =>
          r.audioUrl ? (
            <div className="result-box">
              <audio src={r.audioUrl} controls style={{ width: '100%' }} />
            </div>
          ) : (
            <div className="result-box">{r.status || 'processando...'}</div>
          )
        }
      />

      <Etapa
        n={3}
        title="Imagem de fundo (única, em loop)"
        status={status.visual}
        loading={loading === 'visual'}
        onRun={generateVisual}
        disabled={!results.script?.imagemDescricao}
        result={results.visual}
        renderResult={(r) => (
          <div className="result-box">
            {r.arquivos?.[0]?.imageUrl ? (
              <img src={r.arquivos[0].imageUrl} alt="fundo" style={{ width: '100%', maxWidth: 300, borderRadius: 6 }} />
            ) : (
              <div style={{ color: '#ff9d9d' }}>{r.arquivos?.[0]?.erro || 'Erro ao gerar imagem'}</div>
            )}
          </div>
        )}
      />

      <Etapa
        n={4}
        title="Montar vídeo"
        status={status.assemble}
        loading={loading === 'assemble'}
        onRun={assembleVideo}
        disabled={!results.voice?.audioUrl || !results.visual?.arquivos?.[0]?.imageUrl}
        result={results.assemble}
        renderResult={(r) =>
          r.videoUrl ? (
            <div className="result-box">
              <video src={r.videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            </div>
          ) : (
            <div className="result-box">{r.status || 'processando...'}</div>
          )
        }
      />

      <Etapa
        n={5}
        title="Thumbnail"
        status={status.thumbnail}
        loading={loading === 'thumbnail'}
        onRun={generateThumbnail}
        disabled={!results.script?.titulo}
        result={results.thumbnail}
        renderResult={(r) =>
          r.imageUrl ? (
            <div className="result-box">
              <img src={r.imageUrl} alt="thumbnail" style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            </div>
          ) : (
            <div className="result-box">{r.status || 'sem imagem'}</div>
          )
        }
      />

      <Etapa
        n={6}
        title="Publicar no YouTube (privado)"
        status={status.publish}
        loading={loading === 'publish'}
        onRun={publish}
        disabled={!results.assemble?.videoUrl}
        result={results.publish}
      />

      <Etapa
        n={7}
        title="Salvar em Meus Projetos"
        status={status.salvar}
        loading={loading === 'salvar'}
        onRun={salvarProjeto}
        disabled={!results.assemble?.videoUrl}
        result={results.salvar}
      />
    </div>
  );
}

function Etapa({ n, title, status, loading, onRun, disabled, result, renderResult }) {
  return (
    <div className="card">
      <h2>
        <span className={`step-badge ${status === 'ok' ? 'done' : ''}`}>{n}</span>
        {title}
        {status && <span className={`status ${status}`}>{status === 'ok' ? 'pronto' : 'erro'}</span>}
      </h2>
      <button disabled={disabled || loading} onClick={onRun}>
        {loading && <span className="spinner" />}
        {loading ? 'Gerando...' : 'Executar etapa'}
      </button>
      {result && result.error && <div className="result-box">Erro: {result.error}</div>}
      {result && !result.error && renderResult && renderResult(result)}
      {result && !result.error && !renderResult && (
        <div className="result-box">{JSON.stringify(result, null, 2)}</div>
      )}
    </div>
  );
}
