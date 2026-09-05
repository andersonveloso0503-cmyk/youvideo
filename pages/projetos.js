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

async function baixarDireto(videoUrl) {
  try {
    const res = await fetch(`/api/proxy-video?url=${encodeURIComponent(videoUrl)}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'youvideo.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    alert('Não deu pra baixar: ' + err.message);
  }
}

export default function Projetos() {
  const [projetos, setProjetos] = useState(null);
  const [erro, setErro] = useState(null);
  const [arquivos, setArquivos] = useState({});
  const [falhas, setFalhas] = useState({});

  useEffect(() => {
    fetch('/api/list-projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const lista = data.projetos || [];
        setProjetos(lista);
        lista.forEach((p) => {
          if (!p.videoUrl) return;
          fetch(`/api/proxy-video?url=${encodeURIComponent(p.videoUrl)}`)
            .then((r) => {
              if (!r.ok) throw new Error('Falha ao baixar');
              return r.blob();
            })
            .then((blob) => {
              const arquivo = new File([blob], 'youvideo.mp4', { type: 'video/mp4' });
              setArquivos((prev) => ({ ...prev, [p.id]: arquivo }));
            })
            .catch(() => setFalhas((prev) => ({ ...prev, [p.id]: true })));
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
                <button onClick={() => baixarDireto(p.videoUrl)}>Baixar vídeo</button>
              </div>
              <div style={{ marginTop: 10 }}>
                {falhas[p.id] ? (
                  <div style={{ color: '#ff9d9d', fontSize: 12 }}>
                    Não deu pra preparar o compartilhamento automático — segure o dedo em cima do vídeo acima e escolha "Salvar Vídeo" ou "Compartilhar" no menu do seu celular.
                  </div>
                ) : (
                  <button disabled={!arquivos[p.id]} onClick={() => compartilhar(arquivos[p.id], p.titulo)}>
                    {arquivos[p.id] ? 'Enviar (TikTok / Kwai / etc)' : 'Preparando...'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
