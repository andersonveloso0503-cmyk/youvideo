import { useState, useEffect } from 'react';

const SITUACOES = [
  {
    nome: 'Noé organizando o embarque dos animais',
    tema:
      'Noé tentando organizar a fila de embarque dos animais na arca, dois a dois, e a bagunça que isso vira: animais que não querem entrar, briga por lugar, confusão de quem já embarcou ou não, enquanto a chuva já está quase começando.',
  },
  {
    nome: 'Golias esperando alguém topar o duelo',
    tema:
      'Golias, o gigante filisteu, esperando há 40 dias por alguém do exército de Israel que tope duelar com ele, cada vez mais entediado e impaciente, gritando desafios que ninguém responde, até finalmente aparecer um jovem pastor desarmado chamado Davi.',
  },
  {
    nome: 'Jonas tentando negociar pra não ir a Nínive',
    tema:
      'Jonas tentando de todo jeito arranjar desculpas pra não obedecer à ordem de ir pregar em Nínive, embarcando escondido num navio pra fugir na direção contrária, até a tempestade e o grande peixe aparecerem no pior momento possível.',
  },
  {
    nome: 'José contando os sonhos pros irmãos',
    tema:
      'José contando empolgado pros irmãos mais velhos os sonhos em que todos se curvam diante dele, sem perceber o clima cada vez mais tenso e as caras fechadas dos irmãos ao redor, até a situação virar ciúme total.',
  },
  {
    nome: 'Sansão explicando o corte de cabelo',
    tema:
      'Sansão tentando esconder de todo mundo o segredo da sua força vindo do cabelo, e a insistência de Dalila perguntando repetidas vezes qual é o segredo, com ele inventando desculpas cada vez mais esfarrapadas até finalmente contar a verdade.',
  },
  {
    nome: 'Moisés voltando pro Faraó pela enésima vez',
    tema:
      'Moisés tendo que voltar ao palácio do Faraó de novo, pedido atrás de pedido pra libertar o povo de Israel, cada vez mais cansado da resposta repetida de "não", enquanto uma praga atrás da outra vai acontecendo no Egito.',
  },
  {
    nome: 'Os discípulos discutindo quem é o maior',
    tema:
      'Os discípulos de Jesus discutindo pelo caminho, cada um tentando provar por que merece ser considerado o mais importante do grupo, até Jesus os interromper com uma pergunta que pega todo mundo de surpresa.',
  },
  {
    nome: 'Adão explicando por que comeu o fruto',
    tema:
      'Adão tentando se explicar quando é confrontado sobre ter comido o fruto proibido, indo trocando de desculpa e apontando a culpa pra outro lado, numa cena de justificativa cada vez mais sem saída.',
  },
];

export default function CortesComicos() {
  const estilo = 'desenho';
  const formato = 'short';

  const [situacaoEscolhida, setSituacaoEscolhida] = useState(SITUACOES[0].nome);
  const [temaCustom, setTemaCustom] = useState('');
  const [usarCustom, setUsarCustom] = useState(false);
  const tema = usarCustom ? temaCustom : (SITUACOES.find((h) => h.nome === situacaoEscolhida)?.tema || '');

  const [duracaoDesejada, setDuracaoDesejada] = useState('60');
  const [vozId, setVozId] = useState('');
  const [modeloVoz, setModeloVoz] = useState('eleven');
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
    runStep('script', '/api/generate-script-comico', { tema, estilo, formato, duracaoDesejada });

  const generateVoice = () =>
    runStep('voice', '/api/generate-voice', {
      texto: results.script?.narracao || '',
      vozId,
      modelo: modeloVoz === 'flash' ? 'flash' : undefined,
    });

  const generateVisual = async () => {
    const numCenas = (results.script?.cenas || []).length || 1;
    const ultimaPalavra = (results.voice?.palavras || []).filter((p) => p.end != null).pop();
    const duracaoAlvoCalc = ultimaPalavra ? (ultimaPalavra.end + 0.4) / numCenas : undefined;
    const serieSelecionada = series.find((s) => s.id === serieId);

    await runStep('visual', '/api/generate-visual', {
      cenas: results.script?.cenas || [],
      estilo,
      formato,
      imagemReferenciaUrl: serieSelecionada?.imagemReferenciaUrl,
    });
    setDuracaoAlvo(duracaoAlvoCalc);
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

  const salvarProjeto = () =>
    runStep('salvar', '/api/save-project', {
      tema,
      estilo,
      formato,
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
      <h1>Cortes Cômicos Bíblicos</h1>
      <p className="subtitle">Situações engraçadas com personagens bíblicos, em desenho animado, formato Short — pra publicar no canal Em Nome de Jesus.</p>
      <p style={{ marginTop: -8 }}>
        <a href="/" style={{ color: '#4f7cff', fontSize: 13 }}>← voltar pro painel principal</a>
      </p>

      <div className="card">
        <h2>Escolha a situação</h2>
        <label>Situação engraçada</label>
        <select
          value={usarCustom ? '__custom__' : situacaoEscolhida}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setUsarCustom(true);
            } else {
              setUsarCustom(false);
              setSituacaoEscolhida(e.target.value);
            }
          }}
        >
          {SITUACOES.map((h) => (
            <option key={h.nome} value={h.nome}>{h.nome}</option>
          ))}
          <option value="__custom__">Outra situação (digitar)</option>
        </select>

        {usarCustom && (
          <>
            <label>Descreva a situação</label>
            <textarea
              placeholder="Ex: Pedro tentando andar sobre a água de novo depois de já ter afundado uma vez"
              value={temaCustom}
              onChange={(e) => setTemaCustom(e.target.value)}
            />
          </>
        )}

        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          Estilo visual travado em <b>Desenho animado</b> e formato travado em <b>Short</b> nessa tela.
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>Duração desejada</label>
            <select value={duracaoDesejada} onChange={(e) => setDuracaoDesejada(e.target.value)}>
              <option value="30">Até 30 segundos</option>
              <option value="60">Até 1 minuto</option>
              <option value="90">Até 1min30</option>
            </select>
          </div>
        </div>

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

      <div className="card">
        <h2>Salvar este projeto</h2>
        <button disabled={!results.script || loading === 'salvar'} onClick={salvarProjeto}>
          {loading === 'salvar' && <span className="spinner" />}
          {loading === 'salvar' ? 'Salvando...' : 'Salvar projeto'}
        </button>
        {status.salvar === 'ok' && <div className="result-box">Salvo! Vê em "Meus Projetos" no topo da página.</div>}
        {status.salvar === 'error' && <div className="result-box">Erro: {results.salvar?.error}</div>}
      </div>
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
        <button style={{ marginTop: 0 }} onClick={() => baixarArquivo(result.videoUrl, 'corte-comico.mp4')}>
          Baixar vídeo completo
        </button>
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
