import { useState } from 'react';
import { upload } from '@vercel/blob/client';

export default function MusicaCantada() {
  const [titulo, setTitulo] = useState('');
  const [arquivoVideo, setArquivoVideo] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [erro, setErro] = useState(null);

  async function enviarVideo() {
    setErro(null);
    if (!arquivoVideo) return setErro('Escolha o vídeo já pronto (gerado no Musicful, ilovesong.ai etc.)');

    setEnviando(true);
    try {
      const blob = await upload(arquivoVideo.name, arquivoVideo, {
        access: 'public',
        handleUploadUrl: '/api/video-upload',
      });
      setVideoUrl(blob.url);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container">
      <h1>Cantor Virtual</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a>
      </p>

      <div className="card">
        <h2>1. Gerar o vídeo cantando (fora do Youvideo)</h2>
        <p style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.5 }}>
          Gere o vídeo do personagem cantando a música num desses sites (foto do personagem + áudio da música,
          escolha o tipo "Singing"):
        </p>
        <ul style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.8, marginTop: 0 }}>
          <li><a href="https://www.musicful.ai/ai-music-video-maker/" target="_blank" rel="noreferrer" style={{ color: '#4f7cff' }}>Musicful — AI Music Video Maker</a></li>
          <li><a href="https://ilovesong.ai/" target="_blank" rel="noreferrer" style={{ color: '#4f7cff' }}>ilovesong.ai — AI Singer Video Generator</a></li>
        </ul>
        <p style={{ color: '#9aa4b2', fontSize: 14 }}>Depois, baixe o vídeo pronto e suba ele abaixo.</p>
      </div>

      <div className="card">
        <h2>2. Subir o vídeo pronto</h2>

        <label>Título (opcional, só organização)</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fé Que Levanta" />

        <label>Arquivo de vídeo</label>
        <input type="file" accept="video/*" onChange={(e) => setArquivoVideo(e.target.files?.[0] || null)} />
        <button disabled={enviando || !arquivoVideo} onClick={enviarVideo} style={{ marginTop: 8 }}>
          {enviando && <span className="spinner" />}
          {enviando ? 'Enviando...' : 'Enviar vídeo'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {videoUrl && (
          <div className="result-box">
            <video src={videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            <PublicarSocialBotao midiaUrl={videoUrl} legenda={titulo} />
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
