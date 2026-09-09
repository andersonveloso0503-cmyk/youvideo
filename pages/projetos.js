import { useEffect, useState } from 'react';

async function compartilhar(arquivo, titulo, setStatus) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: titulo || 'Youvideo' });
    } else {
      setStatus('sem-suporte');
    }
  } catch (err) {
    if (err.name !== 'AbortError') setStatus('erro:' + err.message);
  }
}

export default function Projetos() {
  const [projetos, setProjetos] = useState(null);
  const [erro, setErro] = useState(null);
  const [arquivosProntos, setArquivosProntos] = useState({});
  const [statusEnvio, setStatusEnvio] = useState({});

  useEffect(() => {
    fetch('/api/list-projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const lista = data.projetos || [];
        setProjetos(lista);
        // Baixa cada vídeo em segundo plano assim que a lista carrega, pra
        // "Enviar" poder abrir o menu nativo na hora quando você clicar
        // (no iPhone, esperar o download DEPOIS do clique bloqueia o menu).
        lista.forEach((p) => {
          if (!p.videoUrl) return;
          fetch(`/api/download-video?url=${encodeURIComponent(p.videoUrl)}`)
            .then((r) => {
              if (!r.ok) throw new Error('Falha ao preparar');
              return r.blob();
            })
            .then((blob) => {
              const arquivo = new File([blob], 'youvideo.mp4', { type: 'video/mp4' });
              setArquivosProntos((prev) => ({ ...prev, [p.id]: arquivo }));
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
          {p.youtubeVideoId && (
            <p style={{ fontSize: 12 }}>
              <a
                href={`https://studio.youtube.com/video/${p.youtubeVideoId}/edit`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#4f7cff' }}
              >
                Já está no YouTube como privado — revisar e publicar
              </a>
            </p>
          )}
          {p.avisoYoutube && <p style={{ fontSize: 12, color: '#ff9d9d' }}>{p.avisoYoutube}</p>}
          <p style={{ fontSize: 12, color: '#666' }}>
            {p.estilo} · {p.formato} · {new Date(p.criadoEm).toLocaleString('pt-BR')}
          </p>
          {p.videoUrl && (
            <>
              <video src={p.videoUrl} controls playsInline style={{ width: '100%', maxWidth: 300, borderRadius: 6, marginTop: 10 }} />
              <div style={{ marginTop: 10 }}>
                <button
                  disabled={!arquivosProntos[p.id]}
                  onClick={() =>
                    compartilhar(arquivosProntos[p.id], p.titulo, (s) => setStatusEnvio((prev) => ({ ...prev, [p.id]: s })))
                  }
                  style={{ marginTop: 0 }}
                >
                  {arquivosProntos[p.id] ? 'Enviar (TikTok / Kwai / etc)' : 'Preparando...'}
                </button>
                {statusEnvio[p.id] === 'sem-suporte' && (
                  <div style={{ fontSize: 11, color: '#ff9d9d', marginTop: 4 }}>
                    Esse navegador não suporta compartilhar vídeo direto — usa o botão "Baixar vídeo" abaixo.
                  </div>
                )}
                {statusEnvio[p.id]?.startsWith('erro:') && (
                  <div style={{ fontSize: 11, color: '#ff9d9d', marginTop: 4 }}>{statusEnvio[p.id].slice(5)}</div>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <a href={`/api/download-video?url=${encodeURIComponent(p.videoUrl)}`} target="_blank" rel="noreferrer">
                  <button style={{ marginTop: 0 }}>Baixar vídeo</button>
                </a>
              </div>
              <div style={{ marginTop: 8 }}>
                <a href={p.videoUrl} target="_blank" rel="noreferrer" style={{ color: '#4f7cff', fontSize: 13 }}>
                  Ou abrir o vídeo direto (tela cheia)
                </a>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
