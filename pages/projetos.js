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
          <p style={{ fontSize: 12, color: '#666' }}>
            {p.estilo} · {p.formato} · {new Date(p.criadoEm).toLocaleString('pt-BR')}
          </p>
          {p.videoUrl && (
            <video src={p.videoUrl} controls style={{ width: '100%', maxWidth: 300, borderRadius: 6, marginTop: 10 }} />
          )}
        </div>
      ))}
    </div>
  );
}
