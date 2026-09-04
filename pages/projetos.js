import { useEffect, useState } from 'react';

async function compartilhar(videoUrl, titulo) {
  try {
    const res = await fetch(videoUrl);
    const blob = await res.blob();
    const arquivo = new File([blob], 'youvideo.mp4', { type: 'video/mp4' });

    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: titulo || 'Youvideo' });
    } else {
      // Celular/navegador não suporta compartilhar arquivo direto — baixa
      // pra você mandar manualmente pelo app.
      const blobUrl = URL.createObjectURL(blob);
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
    alert('Não deu pra compartilhar: ' + err.message);
  }
}

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
          <p style={{ fontSize: 12, color: '#666' }}>
            {p.estilo} · {p.formato} · {new Date(p.criadoEm).toLocaleString('pt-BR')}
          </p>
          {p.videoUrl && (
            <>
              <video src={p.videoUrl} controls style={{ width: '100%', maxWidth: 300, borderRadius: 6, marginTop: 10 }} />
              <div style={{ marginTop: 10 }}>
                <button onClick={() => compartilhar(p.videoUrl, p.titulo)}>Enviar (TikTok / Kwai / etc)</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
