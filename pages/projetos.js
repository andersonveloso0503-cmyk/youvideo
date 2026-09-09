import { useEffect, useState } from 'react';

export default function Projetos() {
  const [projetos, setProjetos] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    fetch('/api/list-projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setProjetos(data.projetos || []);
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
                <a href={p.videoUrl} download target="_blank" rel="noreferrer">
                  <button style={{ marginTop: 0 }}>Baixar / Abrir vídeo</button>
                </a>
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
                No computador, isso baixa direto. No iPhone/Android, abre o vídeo em tela cheia — toque no ícone de compartilhar dentro do player pra salvar na galeria ou mandar pro TikTok/Kwai.
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
