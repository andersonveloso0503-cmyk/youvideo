import { useState } from 'react';

export default function Reformatar() {
  const [colecao, setColecao] = useState('musica_fila');
  const [itemId, setItemId] = useState('');
  const [novoFormato, setNovoFormato] = useState('short');
  const [ambiente, setAmbiente] = useState('sandbox');

  const [status, setStatus] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [publicado, setPublicado] = useState(null);

  async function reformatar() {
    setErro(null);
    setResultado(null);
    setPublicado(null);
    if (!itemId) return setErro('Cole o ID do item primeiro');

    setStatus('iniciando');
    try {
      const res = await fetch('/api/reformatar-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colecao, itemId, novoFormato, ambiente }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStatus('montando');
      let tentativas = 0;
      while (tentativas < 40) {
        await new Promise((r) => setTimeout(r, 5000));
        const check = await fetch(`/api/assemble-video?id=${data.renderId}&ambiente=${ambiente}`).then((r) => r.json());
        if (check.status === 'done') {
          setResultado({ ...data, videoUrl: check.videoUrl });
          setStatus('pronto');
          return;
        }
        if (check.status === 'failed') {
          throw new Error(`Falha na montagem: ${check.erro || 'motivo não informado'}`);
        }
        tentativas++;
      }
      throw new Error('Demorou demais pra terminar — confira depois manualmente.');
    } catch (err) {
      setErro(err.message);
      setStatus(null);
    }
  }

  async function publicar() {
    if (!resultado) return;
    setPublicando(true);
    try {
      const res = await fetch('/api/youtube-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: resultado.videoUrl,
          thumbnailUrl: resultado.thumbnailUrl,
          titulo: resultado.titulo,
          descricao: `${resultado.titulo}`,
          tags: [],
          canal: resultado.canal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPublicado(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div className="container">
      <h1>Reformatar vídeo</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a>
      </p>

      <div className="card">
        <h2>Trocar vertical ↔ horizontal sem regenerar nada</h2>
        <p style={{ fontSize: 13, color: '#999' }}>
          Reaproveita o mesmo áudio, imagens e sincronia da legenda — só remonta no formato novo.
          Precisa do ID do documento no Firestore (coleção youvideo_fila pros vídeos bíblicos, ou
          youvideo_musica_fila pra música/medley).
        </p>

        <label>De onde é esse vídeo</label>
        <select value={colecao} onChange={(e) => setColecao(e.target.value)}>
          <option value="musica_fila">Música / Medley (youvideo_musica_fila)</option>
          <option value="fila">Vídeo bíblico narrado (youvideo_fila)</option>
        </select>

        <label>ID do documento no Firestore</label>
        <input type="text" value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Ex: vAM2t0btQG5VG8Es5xMd" />

        <label>Novo formato</label>
        <select value={novoFormato} onChange={(e) => setNovoFormato(e.target.value)}>
          <option value="short">Short (vertical)</option>
          <option value="longo">Vídeo longo (horizontal)</option>
        </select>

        <label>Montagem</label>
        <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
          <option value="sandbox">Testar (Sandbox — grátis, com marca d'água)</option>
          <option value="production">Publicar de verdade (Produção)</option>
        </select>

        <button disabled={status === 'iniciando' || status === 'montando'} onClick={reformatar} style={{ marginTop: 12 }}>
          {(status === 'iniciando' || status === 'montando') && <span className="spinner" />}
          {status === 'montando' ? 'Montando...' : status === 'iniciando' ? 'Iniciando...' : 'Reformatar'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}

        {resultado && (
          <div className="result-box">
            <video src={resultado.videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            <div style={{ marginTop: 10 }}>
              <button disabled={publicando} onClick={publicar} style={{ marginTop: 0 }}>
                {publicando && <span className="spinner" />}
                {publicando ? 'Publicando...' : 'Publicar esse formato também no YouTube'}
              </button>
            </div>
            {publicado && (
              <div style={{ fontSize: 13, color: '#8fd6c1', marginTop: 8 }}>
                Publicado! videoId: {publicado.videoId}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
