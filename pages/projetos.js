import { useEffect, useState } from 'react';

async function compartilhar(arquivoPreparado, titulo) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [arquivoPreparado] })) {
      await navigator.share({ files: [arquivoPreparado], title: titulo || 'Youvideo' });
    } else {
      const blobUrl = URL.createObjectURL(arquivoPreparado);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'youvideo.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      alert('Seu navegador não suporta o menu de compartilhar direto. O vídeo foi baixado — abre ele e compartilha manualmente pro TikTok/Kwai.');
    }
  } catch (err) {
    if (err.name !== 'AbortError') alert('Não deu pra compartilhar: ' + err.message);
  }
}

export default function Projetos() {
  const [projetos, setProjetos] = useState(null);
  const [erro, setErro] = useState(null);
  const [arquivos, setArquivos] = useState({});

  useEffect(() => {
    fetch('/api/list-projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const lista = data.projetos || [];
        setProjetos(lista);
        // Baixa cada vídeo em segundo plano assim que a lista chega, pra
        // "Enviar" poder abrir o menu nativo instantaneamente quando clicado
        // (no iPhone, esperar o download DEPOIS do clique faz o menu não abrir).
        lista.forEach((p) => {
          if (!p.videoUrl) return;
          fetch(p.videoUrl)
            .then((r) => r.blob())
            .then((blob) => {
              const arquivo = new File([blob], 'youvideo.mp4', { type: 'video/mp4' });
              setArquivos((prev) => ({ ...prev, [p.id]: arquivo }));
            })
            .catch(() => {});
        });
      })
      .catch((err) => setErro(err.message));
  }, []);

  return (
    <div className="container">
      <h1>Meus Projetos</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← voltar pro painel</a>
      </p>

      {erro && <div className="card">Erro: {erro}</div>}
      {!projetos && !erro && <div className="card">Carregando...</div>}
      {projetos && !projetos.length && <div className="card">Nenhum projeto salvo ainda.</div>}

      {projetos?.map((p) => (
        <div key={p.id} className="card">
          <h2>{p.titulo}</h2>
          {p.thumbnailUrl && (
            <img src={p.thumbnailUrl} alt={p.titulo} style={{ width: '100%', maxWidth: 300, borderRadius: 6, marginBottom: 10 }} />
          )}
          <p style={{ fontSize: 13, color: '#aaa' }}>{p.descricao}</p>
          <p style={{ fontSize: 12, color: '#666' }}>
            {p.estilo} · {p.formato} · {new Date(p.criadoEm).toLocaleString('pt-BR')}
          </p>
          {p.videoUrl && (
            <>
              <video src={p.videoUrl} controls style={{ width: '100%', maxWidth: 300, borderRadius: 6, marginTop: 10 }} />
              <div style={{ marginTop: 10 }}>
                <button
                  disabled={!arquivos[p.id]}
                  onClick={() => compartilhar(arquivos[p.id], p.titulo)}
                >
                  {arquivos[p.id] ? 'Enviar (TikTok / Kwai / etc)' : 'Preparando...'}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
