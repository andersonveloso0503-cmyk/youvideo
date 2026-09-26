import { useState, useEffect } from 'react';
import PainelOrcamento from '../components/PainelOrcamento';

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
        {buscando && <span className="spinner" />}
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

export default function Home() {
  const [tema, setTema] = useState('');
  const [estilo, setEstilo] = useState('realista');
  const [formato, setFormato] = useState('longo');
  const [duracaoDesejada, setDuracaoDesejada] = useState('420');
  const [vozId, setVozId] = useState('');
  const [modeloVoz, setModeloVoz] = useState('eleven');
  const [motorRender, setMotorRender] = useState('shotstack');
  const [vozes, setVozes] = useState(null);
  const [serieId, setSerieId] = useState('');
  const [series, setSeries] = useState([]);

  useEffect(() => {
    fetch('/api/list-voices')
      .then((r) => r.json())
      .then((data) => setVozes(data.vozes || []))
      .catch(() => setVozes([]));
    fetch('/api/serie-listar')
      .then((r) => r.json())
      .then((data) => setSeries(data.series || []))
      .catch(() => setSeries([]));
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
      if (!res.ok) {
        // Mantém a resposta inteira (não só a mensagem) — alguns endpoints
        // (como o JSON2Video) mandam detalhes extras úteis pra debugar.
        setStatus((s) => ({ ...s, [key]: 'error' }));
        setResults((r) => ({ ...r, [key]: { error: data.error || 'Falha na etapa', ...data } }));
        return null;
      }
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
      modelo: modeloVoz === 'flash' ? 'flash' : undefined,
    });

  const generateVisual = async () => {
    const numCenas = (results.script?.cenas || []).length || 1;
    const ultimaPalavra = (results.voice?.palavras || []).filter((p) => p.end != null).pop();
    const duracaoAlvo = ultimaPalavra ? (ultimaPalavra.end + 0.4) / numCenas : undefined;
    const serieSelecionada = series.find((s) => s.id === serieId);

    await runStep('visual', '/api/generate-visual', {
      cenas: results.script?.cenas || [],
      estilo,
      formato,
      imagemReferenciaUrl: serieSelecionada?.imagemReferenciaUrl,
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
        const check = await fetch(
          `/api/check-kling-status?statusUrl=${encodeURIComponent(arquivo.statusUrl)}&responseUrl=${encodeURIComponent(arquivo.responseUrl)}`
        ).then((r) => r.json());
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
      marca: 'Em Nome de Jesus',
      motor: motorRender,
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
      thumbnailTitulo: results.script?.thumbnailTitulo,
      thumbnailSubtitulo: results.script?.thumbnailSubtitulo,
      imagemReferenciaUrl: series.find((s) => s.id === serieId)?.imagemReferenciaUrl,
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

  const publishSocial = () =>
    runStep('publishSocial', '/api/publicar-social', {
      tipo: 'video',
      midiaUrl: results.assemble?.videoUrl,
      legenda: results.script?.descricao,
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
      <p className="subtitle">Seu estúdio automático de vídeos bíblicos e música gospel.</p>

      <PainelOrcamento />

      <div className="hub-grid">
        <a href="/novo-canal" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Novo canal</div>
          <div className="hub-tile-desc">Criar um canal novo do zero (wizard guiado)</div>
        </a>
        <a href="/canal" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Meus canais</div>
          <div className="hub-tile-desc">Adicionar temas, ver status e reformatar vídeos por canal</div>
        </a>
        <a href="/musica" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Música</div>
          <div className="hub-tile-desc">Uma música só, do áudio até publicar no YouTube</div>
        </a>
        <a href="/musica-fila" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Fila de músicas</div>
          <div className="hub-tile-desc">Suba várias e deixe publicar sozinho, uma por dia</div>
        </a>
        <a href="/medley" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Medley</div>
          <div className="hub-tile-desc">Junte músicas de estilos diferentes numa faixa só</div>
        </a>
        <a href="/musica-cantada" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Cantor Virtual</div>
          <div className="hub-tile-desc">Sobe o vídeo do personagem cantando (gerado no Musicful/ilovesong.ai) e publica</div>
        </a>
        <a href="/compilador" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Compilador (app de PC)</div>
          <div className="hub-tile-desc">Compilações de horas com onda de áudio, legenda e publicação em vários canais — gera no seu PC</div>
        </a>
        <a href="/cover" className="hub-tile hub-tile--gold">
          <div className="hub-tile-title">Cover IA</div>
          <div className="hub-tile-desc">Separa voz e instrumental e canta a música com uma voz de IA por estilo</div>
        </a>
        <a href="/temas" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Temas</div>
          <div className="hub-tile-desc">Banco de ideias pros vídeos narrados</div>
        </a>
        <a href="/agendar" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Agendar vídeos</div>
          <div className="hub-tile-desc">Fila automática dos vídeos bíblicos narrados</div>
        </a>
        <a href="/projetos" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Meus projetos</div>
          <div className="hub-tile-desc">Tudo que já foi criado, dos dois canais</div>
        </a>
        <a href="/transcrever" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Transcrever áudio</div>
          <div className="hub-tile-desc">Recuperar a letra real cantada de uma música</div>
        </a>
        <a href="/desenho" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Histórias Animadas</div>
          <div className="hub-tile-desc">Histórias bíblicas prontas em desenho animado, só escolher e gerar</div>
        </a>
        <a href="/cortes-comicos" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Cortes Cômicos</div>
          <div className="hub-tile-desc">Situações engraçadas com personagens bíblicos, em desenho animado, formato Short</div>
        </a>
        <a href="/oracao" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Orações Matinais</div>
          <div className="hub-tile-desc">Oração calma com 1 imagem em loop, pra ouvir de manhã</div>
        </a>
        <a href="/series" className="hub-tile hub-tile--teal">
          <div className="hub-tile-title">Séries</div>
          <div className="hub-tile-desc">Personagens com rosto consistente entre vídeos</div>
        </a>
      </div>

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

        <label>Série (personagem consistente, opcional)</label>
        <select value={serieId} onChange={(e) => setSerieId(e.target.value)}>
          <option value="">Nenhuma (personagem novo a cada vídeo)</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        {series.length === 0 && (
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            Nenhuma série criada ainda — <a href="/series" style={{ color: '#4f7cff' }}>criar uma</a>
          </div>
        )}

        <label>Voz do narrador</label>
        <select value={vozId} onChange={(e) => setVozId(e.target.value)}>
          <option value="">Padrão</option>
          {vozes?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome} {v.genero ? `(${v.genero})` : ''}
            </option>
          ))}
        </select>

        <label>Modelo de voz</label>
        <select value={modeloVoz} onChange={(e) => setModeloVoz(e.target.value)}>
          <option value="eleven">Eleven (mais expressivo, 1 crédito/caractere)</option>
          <option value="flash">Flash (mais econômico, 0,5 crédito/caractere — rende o dobro)</option>
        </select>

        <label>Motor de montagem do vídeo</label>
        <select value={motorRender} onChange={(e) => setMotorRender(e.target.value)}>
          <option value="shotstack">Shotstack (de sempre)</option>
          <option value="json2video">JSON2Video (teste — mais barato)</option>
        </select>
        {motorRender === 'json2video' && (
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            Ainda em teste: sem o efeito de equalizador, e a legenda usa o estilo nativo do JSON2Video (visual um pouco diferente da Shotstack).
          </div>
        )}
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
        renderResult={(r) => (
          <ScriptResult
            result={r}
            onNarracaoChange={(novoTexto) =>
              setResults((res) => ({ ...res, script: { ...res.script, narracao: novoTexto } }))
            }
            onCenaChange={(indice, novoTexto) =>
              setResults((res) => {
                const cenas = [...(res.script?.cenas || [])];
                cenas[indice] = { ...cenas[indice], descricao: novoTexto };
                return { ...res, script: { ...res.script, cenas } };
              })
            }
          />
        )}
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
            <VisualResult
              result={r}
              estilo={estilo}
              formato={formato}
              imagemReferenciaUrl={series.find((s) => s.id === serieId)?.imagemReferenciaUrl}
              onRetryCena={(indice, novoArquivo) =>
                setResults((res) => {
                  const arquivos = [...(res.visual?.arquivos || [])];
                  arquivos[indice] = novoArquivo;
                  return { ...res, visual: { ...res.visual, arquivos } };
                })
              }
            />
            {r.arquivos?.some((a) => a.imageUrl && !a.klingTaskId && !a.videoUrl) && (
              <button onClick={animateScenes} disabled={loading === 'visual'}>
                {loading === 'visual' && <span className="spinner" />}
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

      <StepCard
        n={8}
        title="Publicar no Facebook e Instagram"
        status={status.publishSocial}
        loading={loading === 'publishSocial'}
        disabled={!results.assemble?.videoUrl}
        onRun={publishSocial}
        result={results.publishSocial}
        renderResult={(r) => (
          <div style={{ fontSize: 13 }}>
            {r.facebook?.erro ? (
              <div style={{ color: '#ff9d8c' }}>Facebook: {r.facebook.erro}</div>
            ) : (
              <div style={{ color: 'var(--teal)' }}>
                Facebook: publicado —{' '}
                <a href={r.facebook?.url} target="_blank" rel="noreferrer">
                  ver post
                </a>
              </div>
            )}
            {r.instagram?.erro ? (
              <div style={{ color: '#ff9d8c' }}>Instagram: {r.instagram.erro}</div>
            ) : (
              <div style={{ color: 'var(--teal)' }}>
                Instagram: publicado —{' '}
                <a href={r.instagram?.url} target="_blank" rel="noreferrer">
                  ver post
                </a>
              </div>
            )}
          </div>
        )}
      />

      <div className="card">
        <h2>Salvar este projeto</h2>
        <button disabled={!results.script || loading === 'salvar'} onClick={salvarProjeto}>
          {loading === 'salvar' && <span className="spinner" />}
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
        {loading && <span className="spinner" />}
        {loading ? 'Gerando...' : 'Executar etapa'}
      </button>
      {result && result.error && (
        <div className="result-box">
          Erro: {result.error}
          {Object.keys(result).some((k) => k !== 'error') && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 8, opacity: 0.8 }}>
              {JSON.stringify(
                Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'error')),
                null,
                2
              )}
            </pre>
          )}
        </div>
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

function VisualResult({ result, onRetryCena, estilo, formato, imagemReferenciaUrl }) {
  const [textoEdit, setTextoEdit] = useState({});
  const [tentandoIndice, setTentandoIndice] = useState(null);

  const tentarDeNovo = async (indice, arquivoOriginal) => {
    setTentandoIndice(indice);
    try {
      const res = await fetch('/api/generate-visual-cena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: textoEdit[indice] ?? arquivoOriginal.cena,
          textoNarrado: arquivoOriginal.textoNarrado,
          estilo,
          formato,
          imagemReferenciaUrl,
          start: arquivoOriginal.start,
          length: arquivoOriginal.length,
        }),
      });
      const novoArquivo = await res.json();
      if (!res.ok) throw new Error(novoArquivo.error || 'Erro ao tentar de novo');
      onRetryCena && onRetryCena(indice, novoArquivo);
    } catch (err) {
      onRetryCena && onRetryCena(indice, { cena: arquivoOriginal.cena, erro: err.message });
    } finally {
      setTentandoIndice(null);
    }
  };

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
              <div style={{ color: '#ff9d9d', fontSize: 11 }}>
                {a.erro}
                <textarea
                  value={textoEdit[i] ?? a.cena ?? ''}
                  onChange={(e) => setTextoEdit((t) => ({ ...t, [i]: e.target.value }))}
                  style={{ width: '100%', minHeight: 60, fontSize: 11, marginTop: 6, fontFamily: 'inherit' }}
                />
                <button
                  style={{ marginTop: 4, fontSize: 11, padding: '4px 8px' }}
                  disabled={tentandoIndice === i}
                  onClick={() => tentarDeNovo(i, a)}
                >
                  {tentandoIndice === i && <span className="spinner" />}
                  {tentandoIndice === i ? 'Gerando...' : 'Tentar de novo'}
                </button>
              </div>
            ) : (
              <div style={{ color: '#999' }}>{a.status || 'sem imagem'}</div>
            )}
            {a.klingTaskId && !a.videoUrl && !a.falhouAnimacao && (
              <div style={{ fontSize: 11, color: '#4f7cff' }}>animando...</div>
            )}
            {a.avisoVideo && (
              <div style={{ fontSize: 11, color: '#ff9d9d' }}>{a.avisoVideo}</div>
            )}
            {!a.erro && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{a.cena}</div>}
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

function ScriptResult({ result, onNarracaoChange, onCenaChange }) {
  const caracteres = (result.narracao || '').length;
  return (
    <div className="result-box" style={{ whiteSpace: 'normal' }}>
      <p><b>Título:</b> {result.titulo}</p>
      <p><b>Descrição:</b> {result.descricao}</p>
      <p><b>Tags:</b> {(result.tags || []).join(', ')}</p>
      <p>
        <b>Narração</b>{' '}
        <span style={{ fontSize: 11, color: '#999' }}>
          ({caracteres} caracteres — edite livremente antes de gerar a voz)
        </span>
      </p>
      <textarea
        value={result.narracao || ''}
        onChange={(e) => onNarracaoChange && onNarracaoChange(e.target.value)}
        style={{ width: '100%', minHeight: 160, fontFamily: 'inherit', fontSize: 'inherit' }}
      />
      <p>
        <b>Cenas ({(result.cenas || []).length})</b>{' '}
        <span style={{ fontSize: 11, color: '#999' }}>
          (edite a descrição se alguma imagem for barrada pelo filtro de conteúdo)
        </span>
      </p>
      <ol>
        {(result.cenas || []).map((c, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <textarea
              value={c.descricao || ''}
              onChange={(e) => onCenaChange && onCenaChange(i, e.target.value)}
              style={{ width: '100%', minHeight: 50, fontFamily: 'inherit', fontSize: 'inherit' }}
            />
            {c.textoNarrado && <div style={{ color: '#999' }}>"{c.textoNarrado}"</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
