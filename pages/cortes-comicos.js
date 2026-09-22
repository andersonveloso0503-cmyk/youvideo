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

const VOZ_TIPO_LABEL = {
  normal: 'Normal',
  grave: 'Grave (imponente)',
  aguda: 'Aguda (cômica/animal)',
};

export default function CortesComicos() {
  const estilo = 'desenho';
  const formato = 'short';

  const [situacaoEscolhida, setSituacaoEscolhida] = useState(SITUACOES[0].nome);
  const [temaCustom, setTemaCustom] = useState('');
  const [usarCustom, setUsarCustom] = useState(false);
  const tema = usarCustom ? temaCustom : (SITUACOES.find((h) => h.nome === situacaoEscolhida)?.tema || '');

  const [duracaoDesejada, setDuracaoDesejada] = useState('60');
  const [modeloVoz, setModeloVoz] = useState('eleven');
  const [serieId, setSerieId] = useState('');
  const [series, setSeries] = useState([]);

  useEffect(() => {
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

  const generateVoice = async () => {
    const cenas = results.script?.cenas || [];
    const falas = cenas.map((c) => ({ personagem: c.personagem, texto: c.textoNarrado, vozTipo: c.vozTipo }));

    const voiceData = await runStep('voice', '/api/generate-voice-dialogo', {
      falas,
      modelo: modeloVoz === 'flash' ? 'flash' : undefined,
    });
    if (!voiceData) return;

    // Cola o tempo exato de cada fala na cena correspondente, na mesma
    // ordem — é isso que faz a imagem/vídeo de cada cena bater certinho
    // com o começo e o fim de quem está falando ali.
    const cenasComTempo = voiceData.cenasComTempo || [];
    setResults((r) => {
      const cenasAtualizadas = (r.script?.cenas || []).map((c, i) => ({
        ...c,
        start: cenasComTempo[i]?.start,
        length: cenasComTempo[i]?.length,
      }));
      return { ...r, script: { ...r.script, cenas: cenasAtualizadas } };
    });
  };

  const generateVisual = async () => {
    const serieSelecionada = series.find((s) => s.id === serieId);

    await runStep('visual', '/api/generate-visual', {
      cenas: results.script?.cenas || [],
      estilo,
      formato,
      imagemReferenciaUrl: serieSelecionada?.imagemReferenciaUrl,
    });

    // Duração média (usada só como alvo pro clipe animado da fal.ai — a
    // montagem final respeita o tempo real de cada fala de qualquer jeito).
    const numCenas = (results.script?.cenas || []).length || 1;
    const duracaoTotal = (results.script?.cenas || []).reduce((soma, c) => soma + (c.length || 0), 0);
    setDuracaoAlvo(duracaoTotal ? duracaoTotal / numCenas : undefined);
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
      audioSegments: results.voice?.audioSegments,
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
      <p className="subtitle">Situações engraçadas com personagens bíblicos, em desenho animado, formato Short, com vozes diferentes por personagem — pra publicar no canal Em Nome de Jesus.</p>
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
          Estilo visual travado em <b>Desenho animado</b> e formato travado em <b>Short</b> nessa tela. A voz de cada personagem é escolhida automaticamente entre as vozes da sua conta ElevenLabs.
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

        <label>Modelo de voz</label>
        <select value={modeloVoz} onChange={(e) => setModeloVoz(e.target.value)}>
          <option value="eleven">Eleven (mais expressivo, 1 crédito/caractere)</option>
          <option value="flash">Flash (mais econômico, 0,5 crédito/caractere — rende o dobro)</option>
        </select>
      </div>

      <StepCard
        n={1}
        title="Roteiro (falas por personagem, título, descrição, tags)"
        status={status.script}
        loading={loading === 'script'}
        disabled={!tema}
        onRun={generateScript}
        result={results.script}
        renderResult={(r) => (
          <ScriptResult
            result={r}
            onFalaChange={(indice, campo, valor) =>
              setResults((res) => {
                const cenas = [...(res.script?.cenas || [])];
                cenas[indice] = { ...cenas[indice], [campo]: valor };
                return { ...res, script: { ...res.script, cenas } };
              })
            }
          />
        )}
      />

      <StepCard
        n={2}
        title="Vozes (uma por personagem, com pitch automático)"
        status={status.voice}
        loading={loading === 'voice'}
        disabled={!results.script?.cenas?.length}
        onRun={generateVoice}
        result={results.voice}
        renderResult={(r) => <VoiceResult result={r} cenas={results.script?.cenas} />}
      />

      <StepCard
        n={3}
        title="Imagens dos personagens e cenas"
        status={status.visual}
        loading={loading === 'visual'}
        disabled={!results.voice?.audioSegments?.length}
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

function VoiceResult({ result, cenas }) {
  if (!result.audioSegments?.length) return <div className="result-box">{result.status || 'processando...'}</div>;
  return (
    <div className="result-box">
      {result.audioSegments.map((seg, i) => (
        <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #333' }}>
          <div style={{ fontSize: 12, color: '#4f7cff', marginBottom: 4 }}>
            <b>{seg.personagem}</b>
            {cenas?.[i]?.vozTipo && cenas[i].vozTipo !== 'normal' && (
              <span style={{ color: '#999' }}> — voz {VOZ_TIPO_LABEL[cenas[i].vozTipo] || cenas[i].vozTipo}</span>
            )}
          </div>
          <audio src={seg.url} controls style={{ width: '100%' }} />
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
        {(result.palavras || []).length} palavras com timing sincronizado no total
      </div>
    </div>
  );
}

function ScriptResult({ result, onFalaChange }) {
  return (
    <div className="result-box" style={{ whiteSpace: 'normal' }}>
      <p><b>Título:</b> {result.titulo}</p>
      <p><b>Descrição:</b> {result.descricao}</p>
      <p><b>Tags:</b> {(result.tags || []).join(', ')}</p>
      <p>
        <b>Falas ({(result.cenas || []).length})</b>{' '}
        <span style={{ fontSize: 11, color: '#999' }}>
          (edite quem fala, o texto, o tipo de voz e a descrição visual antes de gerar as vozes)
        </span>
      </p>
      <ol>
        {(result.cenas || []).map((c, i) => (
          <li key={i} style={{ marginBottom: 14 }}>
            <div className="row" style={{ marginBottom: 4 }}>
              <div>
                <input
                  type="text"
                  value={c.personagem || ''}
                  onChange={(e) => onFalaChange && onFalaChange(i, 'personagem', e.target.value)}
                  placeholder="Quem fala (ex: Narrador, Golias...)"
                  style={{ fontWeight: 600 }}
                />
              </div>
              <div>
                <select
                  value={c.vozTipo || 'normal'}
                  onChange={(e) => onFalaChange && onFalaChange(i, 'vozTipo', e.target.value)}
                >
                  <option value="normal">Voz normal</option>
                  <option value="grave">Voz grave (imponente)</option>
                  <option value="aguda">Voz aguda (cômica/animal)</option>
                </select>
              </div>
            </div>
            <textarea
              value={c.textoNarrado || ''}
              onChange={(e) => onFalaChange && onFalaChange(i, 'textoNarrado', e.target.value)}
              placeholder="O que essa pessoa fala"
              style={{ width: '100%', minHeight: 50, fontFamily: 'inherit', fontSize: 'inherit' }}
            />
            <textarea
              value={c.descricao || ''}
              onChange={(e) => onFalaChange && onFalaChange(i, 'descricao', e.target.value)}
              placeholder="Descrição visual da cena"
              style={{ width: '100%', minHeight: 40, fontFamily: 'inherit', fontSize: 11, color: '#999', marginTop: 4 }}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
