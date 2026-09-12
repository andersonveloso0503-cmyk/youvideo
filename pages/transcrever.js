import { useState } from 'react';
import { upload } from '@vercel/blob/client';

export default function Transcrever() {
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [textoFormatado, setTextoFormatado] = useState(null);
  const [textoCru, setTextoCru] = useState(null);
  const [mostrarCru, setMostrarCru] = useState(false);
  const [erro, setErro] = useState(null);

  async function transcrever() {
    setErro(null);
    setTextoFormatado(null);
    setTextoCru(null);
    if (!arquivo) return setErro('Escolha um arquivo de áudio primeiro');

    setEnviando(true);
    try {
      const blob = await upload(arquivo.name, arquivo, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });

      const res = await fetch('/api/transcrever-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: blob.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTextoFormatado(data.textoFormatado);
      setTextoCru(data.texto);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container">
      <h1>Transcrever áudio</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a>
      </p>

      <div className="card">
        <h2>Recuperar a letra real cantada</h2>
        <p style={{ fontSize: 13, color: '#999' }}>
          Útil quando a música foi editada/estendida no Suno e a letra final ficou diferente da
          que você escreveu originalmente.
        </p>

        <label>Áudio</label>
        <input type="file" accept="audio/*" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />

        <button disabled={enviando} onClick={transcrever} style={{ marginTop: 12 }}>
          {enviando && <span className="spinner" />}
          {enviando ? 'Transcrevendo...' : 'Transcrever'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {textoFormatado && (
          <div className="result-box">
            <p style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
              Já organizado em linhas e com blocos [Verse]/[Chorus]/[Bridge] — confira se bate com o
              que foi cantado antes de usar. Isso é automático e pode errar aqui e ali.
            </p>
            <textarea readOnly value={textoFormatado} style={{ minHeight: 300, fontFamily: 'monospace' }} />

            <button style={{ marginTop: 12 }} onClick={() => setMostrarCru((v) => !v)}>
              {mostrarCru ? 'Esconder texto cru' : 'Ver texto cru (sem formatação)'}
            </button>
            {mostrarCru && (
              <textarea readOnly value={textoCru} style={{ minHeight: 150, marginTop: 8 }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
