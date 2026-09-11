import { useState } from 'react';
import { upload } from '@vercel/blob/client';

const CANAIS = [
  { id: 'apostolos', label: 'Canal apóstolos (bíblico narrado)' },
  { id: 'musica', label: 'Canal música gospel' },
];

const ESTILOS = [
  { id: 'biblico_classico', label: 'Pinturas bíblicas clássicas' },
  { id: 'cinematografico', label: 'Ilustração cinematográfica moderna' },
  { id: 'aquarela', label: 'Aquarela suave' },
];

export default function Musica() {
  const [titulo, setTitulo] = useState('');
  const [canal, setCanal] = useState('musica');
  const [estilo, setEstilo] = useState('cinematografico');
  const [formato, setFormato] = useState('longo');
  const [ambiente, setAmbiente] = useState('sandbox');
  const [letra, setLetra] = useState('');
  const [textoThumbnail, setTextoThumbnail] = useState('');
  const [arquivoAudio, setArquivoAudio] = useState(null);

  const [status, setStatus] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);

  async function runStep(key, fn) {
    setLoading(key);
    setStatus((s) => ({ ...s, [key]: null }));
    try {
      const data = await fn();
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

  async function postJson(endpoint, body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha na etapa');
    return data;
  }

  const enviarAudio = () =>
    runStep('audio', async () => {
      if (!arquivoAudio) throw new Error('Escolha o arquivo de áudio baixado do Suno primeiro');
      const blob = await upload(arquivoAudio.name, arquivoAudio, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });
      return { audioUrl: blob.url };
    });

  const alinharLetra = () =>
    runStep('align', () => {
      if (!results.audio?.audioUrl) throw new Error('Envie o áudio primeiro (etapa 1)');
      if (!letra.trim()) throw new Error('Cole a letra da música primeiro');
      return postJson('/api/align-letra', { audioUrl: results.audio.audioUrl, letra });
    });

  const gerarCenas = () =>
    runStep('cenas', () => {
      if (!results.align?.blocos?.length) throw new Error('Alinhe a letra primeiro (etapa 2)');
      return postJson('/api/generate-cenas-musica', { blocos: results.align.blocos, estilo });
    });

  const gerarImagens = () =>
    runStep('visual', () => {
      if (!results.cenas?.cenas?.length) throw new Error('Gere as cenas primeiro (etapa 3)');
      return postJson('/api/generate-visual', { cenas: results.cenas.cenas, estilo, formato });
    });

  const montarVideo = async () => {
    if (!results.visual?.arquivos?.length) {
      setStatus((s) => ({ ...s, assemble: 'error' }));
      setResults((r) => ({ ...r, assemble: { error: 'Gere as imagens primeiro (etapa 4)' } }));
      return;
    }
    const primeira = await runStep('assemble', () =>
      postJson('/api/assemble-video', {
        audioUrl: results.audio.audioUrl,
        cenas: results.visual.arquivos,
        formato,
        palavras: results.align.palavras,
        ambiente,
      })
    );
    if (!primeira || !primeira.renderId) return;

    setLoading('assemble');
    let tentativas = 0;
    while (tentativas < 40) {
      await new Promise((r) => setTimeout(r, 5000));
      const check = await fetch(`/api/assemble-video?id=${primeira.renderId}&ambiente=${ambiente}`).then((r) => r.json());
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

  const gerarThumbnail = () =>
    runStep('thumbnail', () =>
      postJson('/api/generate-thumbnail', { tema: titulo, titulo, estilo, textoThumbnail })
    );

  const publicar = () =>
    runStep('publish', () =>
      postJson('/api/youtube-upload', {
        videoUrl: results.assemble?.videoUrl,
        thumbnailUrl: results.thumbnail?.imageUrl,
        titulo,
        descricao: `${titulo}\n\n${letra}`,
        tags: ['gospel', 'música cristã', 'louvor'],
        canal,
      })
    );

  const salvarProjeto = () =>
    runStep('salvar', () =>
      postJson('/api/save-project', {
        tema: titulo,
        estilo,
        formato,
        titulo,
        descricao: letra,
        videoUrl: results.assemble?.videoUrl,
        thumbnailUrl: results.thumbnail?.imageUrl,
        canal,
      })
    );

  return (
    <div className="container">
      <h1>Novo projeto de música</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← voltar pro painel</a> ·{' '}
        <a href="/projetos" style={{ color: '#4f7cff' }}>Meus Projetos</a>
      </p>

      <div className="card">
        <h2>Dados do projeto</h2>

        <label>Canal de destino</label>
        <select value={canal} onChange={(e) => setCanal(e.target.value)}>
          {CANAIS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <label>Título do projeto</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Graça sobre graça" />

        <div className="row">
          <div>
            <label>Estilo visual das cenas</label>
            <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
              {ESTILOS.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Formato</label>
            <select value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="longo">Vídeo longo</option>
              <option value="short">Short (vertical)</option>
            </select>
          </div>
        </div>

        <label>Montagem</label>
        <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
          <option value="sandbox">Testar (Sandbox — grátis, sai com marca d'água)</option>
          <option value="production">Publicar de verdade (Produção — gasta crédito, sem marca d'água)</option>
        </select>

        <label>Texto de destaque pra thumbnail (opcional)</label>
        <input type="text" value={textoThumbnail} onChange={(e) => setTextoThumbnail(e.target.value)} placeholder="Ex: GRAÇA SOBRE GRAÇA" />

        <label>Letra da música (cole exatamente como está no Suno, com [Verse]/[Chorus])</label>
        <textarea
          value={letra}
          onChange={(e) => setLetra(e.target.value)}
          placeholder={'[Verse]\nEle é a luz que não se apaga\n[Chorus]\nGraça sobre graça, é o que Ele me dá'}
          style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 13 }}
        />
      </div>

      <StepCard
        n={1}
        title="Enviar áudio (baixado do Suno)"
        status={status.audio}
        loading={loading === 'audio'}
        onRun={enviarAudio}
        result={results.audio}
        renderResult={(r) => (
          <div className="result-box">
            <audio src={r.audioUrl} controls style={{ width: '100%' }} />
          </div>
        )}
      >
        <input type="file" accept="audio/*" onChange={(e) => setArquivoAudio(e.target.files?.[0] || null)} />
      </StepCard>

      <StepCard
        n={2}
        title="Alinhar letra ao áudio (Whisper via Groq)"
        status={status.align}
        loading={loading === 'align'}
        disabled={!results.audio?.audioUrl}
        onRun={alinharLetra}
        result={results.align}
        renderResult={(r) => (
          <div className="result-box">{(r.palavras || []).length} palavras alinhadas em {(r.blocos || []).length} blocos</div>
        )}
      />

      <StepCard
        n={3}
        title="Gerar cenas bíblicas a partir da letra"
        status={status.cenas}
        loading={loading === 'cenas'}
        disabled={!results.align?.blocos?.length}
        onRun={gerarCenas}
        result={results.cenas}
        renderResult={(r) => (
          <div className="result-box">
            <ol>
              {(r.cenas || []).map((c, i) => (
                <li key={i}>{c.descricao}</li>
              ))}
            </ol>
          </div>
        )}
      />

      <StepCard
        n={4}
        title="Gerar as imagens (Flux)"
        status={status.visual}
        loading={loading === 'visual'}
        disabled={!results.cenas?.cenas?.length}
        onRun={gerarImagens}
        result={results.visual}
        renderResult={(r) => (
          <div className="result-box">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {(r.arquivos || []).map((a, i) => (
                <div key={i} style={{ width: 150 }}>
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt={a.cena} style={{ width: '100%', borderRadius: 6 }} />
                  ) : (
                    <div style={{ color: '#ff9d9d', fontSize: 11 }}>{a.erro}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      />

      <StepCard
        n={5}
        title="Montar o vídeo (áudio + imagens + legenda karaokê)"
        status={status.assemble}
        loading={loading === 'assemble'}
        disabled={!results.visual?.arquivos?.length}
        onRun={montarVideo}
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

      <StepCard
        n={6}
        title="Thumbnail"
        status={status.thumbnail}
        loading={loading === 'thumbnail'}
        disabled={!titulo}
        onRun={gerarThumbnail}
        result={results.thumbnail}
        renderResult={(r) =>
          r.imageUrl ? (
            <div className="result-box">
              <img src={r.imageUrl} alt="thumbnail" style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            </div>
          ) : null
        }
      />

      <StepCard
        n={7}
        title="Publicar no YouTube"
        status={status.publish}
        loading={loading === 'publish'}
        disabled={!results.assemble?.videoUrl}
        onRun={publicar}
        result={results.publish}
      />

      <div className="card">
        <h2>Salvar este projeto</h2>
        <button disabled={!titulo || loading === 'salvar'} onClick={salvarProjeto}>
          {loading === 'salvar' ? 'Salvando...' : 'Salvar projeto'}
        </button>
        {status.salvar === 'ok' && <div className="result-box">Salvo! Vê em "Meus Projetos".</div>}
        {status.salvar === 'error' && <div className="result-box">Erro: {results.salvar?.error}</div>}
      </div>
    </div>
  );
}

function StepCard({ n, title, status, loading, disabled, onRun, result, renderResult, children }) {
  return (
    <div className="card">
      <h2>
        <span className={`step-badge ${status === 'ok' ? 'done' : ''}`}>{n}</span>
        {title}
        {status && <span className={`status ${status}`}>{status === 'ok' ? 'pronto' : 'erro'}</span>}
      </h2>
      {children}
      <button disabled={disabled || loading} onClick={onRun}>
        {loading ? 'Gerando...' : 'Executar etapa'}
      </button>
      {result && result.error && <div className="result-box">Erro: {result.error}</div>}
      {result && !result.error && renderResult && renderResult(result)}
    </div>
  );
}
