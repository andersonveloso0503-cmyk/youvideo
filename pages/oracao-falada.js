import { useState, useEffect } from 'react';

export default function OracaoMatinal() {
  const [titulo, setTitulo] = useState('');
  const [tema, setTema] = useState('');
  const [duracaoDesejada, setDuracaoDesejada] = useState('300');
  const [gerandoRoteiro, setGerandoRoteiro] = useState(false);

  const [texto, setTexto] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [series, setSeries] = useState([]);
  const [serieId, setSerieId] = useState('');

  const [status, setStatus] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    fetch('/api/serie-listar')
      .then((r) => r.json())
      .then((data) => setSeries(data.series || []))
      .catch(() => setSeries([]));
  }, []);

  const imagemEscolhida = serieId ? series.find((s) => s.id === serieId)?.imagemReferenciaUrl : imagemUrl;

  async function gerarRoteiro() {
    setErro(null);
    if (!tema.trim()) return setErro('Escreva o tema da oração (ex: gratidão, um novo começo, força pra enfrentar o dia)');

    setGerandoRoteiro(true);
    try {
      const res = await fetch('/api/gerar-oracao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema, duracaoDesejada }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTexto(data.texto);
    } catch (err) {
      setErro(err.message);
    } finally {
      setGerandoRoteiro(false);
    }
  }

  async function gerar() {
    setErro(null);
    setResultado(null);
    if (!texto.trim()) return setErro('Escreva ou gere o texto da oração primeiro');
    if (!imagemEscolhida) return setErro('Escolha uma série ou cole uma URL de imagem');

    try {
      setStatus('Gerando a narração...');
      const vozRes = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const vozData = await vozRes.json();
      if (!vozRes.ok) throw new Error(vozData.error);

      const totalPedacos = vozData.audioSegments?.length || 1;
      setStatus(
        totalPedacos > 1
          ? `Gerando ${totalPedacos} pedaços de vídeo falado (pode levar alguns minutos)...`
          : 'Gerando o vídeo falado (pode levar 1-2 minutos)...'
      );

      const videoRes = await fetch('/api/gerar-video-falado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemUrl: imagemEscolhida, audioSegments: vozData.audioSegments }),
      });
      const videoData = await videoRes.json();
      if (!videoRes.ok) throw new Error(videoData.error);

      if (videoData.videoUrl) {
        setResultado(videoData.videoUrl);
        setStatus(null);
        return;
      }

      setStatus('Juntando os pedaços na sequência certa...');
      let tentativas = 0;
      while (tentativas < 60) {
        await new Promise((r) => setTimeout(r, 5000));
        const check = await fetch(`/api/gerar-video-falado?id=${videoData.renderId}`).then((r) => r.json());
        if (check.status === 'done') {
          setResultado(check.videoUrl);
          setStatus(null);
          return;
        }
        if (check.status === 'failed') {
          throw new Error(`Falha ao juntar os pedaços: ${check.erro || 'motivo não informado'}`);
        }
        tentativas++;
      }
      throw new Error('Demorou demais pra juntar os pedaços — confira depois manualmente.');
    } catch (err) {
      setErro(err.message);
      setStatus(null);
    }
  }

  return (
    <div className="container">
      <h1>Oração matinal falada</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a> ·{' '}
        <a href="/series" style={{ color: '#4f7cff' }}>Séries de personagens</a>
      </p>

      <div className="card">
        <h2>1. Gerar o texto da oração com IA</h2>
        <label>Tema/foco da oração</label>
        <input
          type="text"
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          placeholder="Ex: gratidão pelo novo dia, força pra enfrentar desafios, entregar as preocupações"
        />

        <label>Duração desejada</label>
        <select value={duracaoDesejada} onChange={(e) => setDuracaoDesejada(e.target.value)}>
          <option value="180">3 minutos</option>
          <option value="300">5 minutos</option>
          <option value="600">10 minutos</option>
          <option value="900">15 minutos</option>
          <option value="1200">20 minutos</option>
        </select>

        <button disabled={gerandoRoteiro} onClick={gerarRoteiro} style={{ marginTop: 12 }}>
          {gerandoRoteiro && <span className="spinner" />}
          {gerandoRoteiro ? 'Escrevendo a oração...' : 'Gerar oração com IA'}
        </button>
      </div>

      <div className="card">
        <h2>2. Revisar o texto (edite à vontade) e escolher o personagem</h2>

        <label>Título (opcional, só organização)</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Oração da manhã de segunda-feira" />

        <label>Texto da oração</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Clique em 'Gerar oração com IA' acima, ou escreva/cole o texto aqui direto"
          style={{ minHeight: 220 }}
        />

        <label>Personagem (de uma série já criada)</label>
        <select value={serieId} onChange={(e) => setSerieId(e.target.value)}>
          <option value="">Nenhuma — vou colar uma URL de imagem</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>

        {!serieId && (
          <>
            <label>URL da imagem (rosto de frente, bem iluminado)</label>
            <input type="text" value={imagemUrl} onChange={(e) => setImagemUrl(e.target.value)} placeholder="https://..." />
          </>
        )}

        {imagemEscolhida && (
          <img src={imagemEscolhida} alt="referência" style={{ width: 120, borderRadius: 8, marginTop: 8 }} />
        )}

        <button disabled={!!status} onClick={gerar} style={{ marginTop: 12 }}>
          {status && <span className="spinner" />}
          {status || '3. Gerar vídeo falado'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {resultado && (
          <div className="result-box">
            <video src={resultado} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            <PublicarSocialBotao midiaUrl={resultado} legenda={titulo || tema} />
          </div>
        )}
      </div>
    </div>
  );
}

function PublicarSocialBotao({ midiaUrl, legenda }) {
  const [publicando, setPublicando] = useState(false);
  const [resultadoPub, setResultadoPub] = useState(null);

  async function publicar() {
    setPublicando(true);
    setResultadoPub(null);
    try {
      const res = await fetch('/api/publicar-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'video', midiaUrl, legenda }),
      });
      const data = await res.json();
      setResultadoPub(data);
    } catch (err) {
      setResultadoPub({ erro: err.message });
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button disabled={publicando} onClick={publicar} style={{ marginTop: 0 }}>
        {publicando && <span className="spinner" />}
        {publicando ? 'Publicando...' : 'Publicar no Facebook e Instagram'}
      </button>
      {resultadoPub && (
        <div style={{ fontSize: 12, marginTop: 6 }}>
          {resultadoPub.facebook?.erro ? (
            <div style={{ color: '#ff9d9d' }}>Facebook: {resultadoPub.facebook.erro}</div>
          ) : (
            <div style={{ color: '#8fd6c1' }}>Facebook: publicado ✓</div>
          )}
          {resultadoPub.instagram?.erro ? (
            <div style={{ color: '#ff9d9d' }}>Instagram: {resultadoPub.instagram.erro}</div>
          ) : (
            <div style={{ color: '#8fd6c1' }}>Instagram: publicado ✓</div>
          )}
        </div>
      )}
    </div>
  );
}
