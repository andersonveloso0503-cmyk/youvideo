import { useState, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

export default function MusicaCantada() {
  const [titulo, setTitulo] = useState('');
  const [series, setSeries] = useState([]);
  const [serieId, setSerieId] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [arquivoAudio, setArquivoAudio] = useState(null);

  const [enviandoAudio, setEnviandoAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [erroAudio, setErroAudio] = useState(null);

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

  async function enviarAudio() {
    setErroAudio(null);
    if (!arquivoAudio) return setErroAudio('Escolha o arquivo de áudio baixado do Suno primeiro');

    setEnviandoAudio(true);
    try {
      const blob = await upload(arquivoAudio.name, arquivoAudio, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });
      setAudioUrl(blob.url);
    } catch (err) {
      setErroAudio(err.message);
    } finally {
      setEnviandoAudio(false);
    }
  }

  async function gerar() {
    setErro(null);
    setResultado(null);
    if (!audioUrl) return setErro('Envie o áudio da música primeiro');
    if (!imagemEscolhida) return setErro('Escolha uma série (personagem) ou cole uma URL de imagem');

    try {
      setStatus('Cortando a música em blocos e sincronizando a boca do personagem (pode levar alguns minutos)...');
      const videoRes = await fetch('/api/gerar-video-cantado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemUrl: imagemEscolhida, audioUrl }),
      });
      const videoData = await videoRes.json();
      if (!videoRes.ok) throw new Error(videoData.error);

      if (videoData.videoUrl) {
        setResultado(videoData.videoUrl);
        setStatus(null);
        return;
      }

      setStatus(`Juntando os ${videoData.montandoBlocos} blocos na sequência certa...`);
      let tentativas = 0;
      while (tentativas < 60) {
        await new Promise((r) => setTimeout(r, 5000));
        const check = await fetch(`/api/gerar-video-cantado?id=${videoData.renderId}`).then((r) => r.json());
        if (check.status === 'done') {
          setResultado(check.videoUrl);
          setStatus(null);
          return;
        }
        if (check.status === 'failed') {
          throw new Error(`Falha ao juntar os blocos: ${check.erro || 'motivo não informado'}`);
        }
        tentativas++;
      }
      throw new Error('Demorou demais pra juntar os blocos — confira depois manualmente.');
    } catch (err) {
      setErro(err.message);
      setStatus(null);
    }
  }

  return (
    <div className="container">
      <h1>Cantor Virtual</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a> ·{' '}
        <a href="/series" style={{ color: '#4f7cff' }}>Séries de personagens</a>
      </p>

      <div className="card">
        <h2>1. Escolher a música e o personagem</h2>

        <label>Título (opcional, só organização)</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fé Que Levanta" />

        <label>Áudio da música (baixado do Suno)</label>
        <input type="file" accept="audio/*" onChange={(e) => setArquivoAudio(e.target.files?.[0] || null)} />
        <button disabled={enviandoAudio || !arquivoAudio} onClick={enviarAudio} style={{ marginTop: 8 }}>
          {enviandoAudio && <span className="spinner" />}
          {enviandoAudio ? 'Enviando...' : 'Enviar áudio'}
        </button>
        {erroAudio && <div className="result-box">Erro: {erroAudio}</div>}
        {audioUrl && (
          <div className="result-box">
            <audio src={audioUrl} controls style={{ width: '100%' }} />
          </div>
        )}

        <label style={{ marginTop: 16 }}>Personagem (de uma série já criada)</label>
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

        <button disabled={!!status} onClick={gerar} style={{ marginTop: 16 }}>
          {status && <span className="spinner" />}
          {status || '2. Gerar vídeo cantado (D-ID, boca sincronizada com a música)'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {resultado && (
          <div className="result-box">
            <video src={resultado} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            <PublicarSocialBotao midiaUrl={resultado} legenda={titulo} />
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
