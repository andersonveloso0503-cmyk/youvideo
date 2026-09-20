import { useState, useEffect } from 'react';

const ESTILOS = [
  { id: 'realista', label: 'Realista' },
  { id: 'desenho', label: 'Desenho animado' },
  { id: 'biblico_classico', label: 'Pinturas bíblicas clássicas' },
  { id: 'cinematografico', label: 'Ilustração cinematográfica moderna' },
];

export default function Series() {
  const [nome, setNome] = useState('');
  const [descricaoPersonagem, setDescricaoPersonagem] = useState('');
  const [estilo, setEstilo] = useState('realista');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(null);
  const [series, setSeries] = useState([]);

  async function carregar() {
    try {
      const res = await fetch('/api/serie-listar');
      const data = await res.json();
      setSeries(data.series || []);
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criarSerie() {
    setErro(null);
    if (!nome) return setErro('Dê um nome pra série');
    if (!descricaoPersonagem) return setErro('Descreva o personagem');

    setGerando(true);
    try {
      const res = await fetch('/api/serie-criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricaoPersonagem, estilo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNome('');
      setDescricaoPersonagem('');
      carregar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="container">
      <h1>Séries de personagens</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a>
      </p>

      <div className="card">
        <h2>Criar uma nova série</h2>
        <p style={{ fontSize: 13, color: '#999' }}>
          Gera uma imagem de referência do personagem uma vez só. Depois, na tela principal, você
          escolhe essa série ao criar um vídeo novo — o rosto e as roupas ficam consistentes em
          todos os vídeos dela.
        </p>

        <label>Nome da série</label>
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Paulo" />

        <label>Descrição do personagem</label>
        <textarea
          value={descricaoPersonagem}
          onChange={(e) => setDescricaoPersonagem(e.target.value)}
          placeholder="Ex: homem de meia-idade, cabelo curto e grisalho, barba curta, olhos castanhos, túnica marrom simples com manto sobre os ombros, aparência séria e determinada"
          style={{ minHeight: 100 }}
        />

        <label>Estilo visual</label>
        <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
          {ESTILOS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>

        <button disabled={gerando} onClick={criarSerie} style={{ marginTop: 12 }}>
          {gerando && <span className="spinner" />}
          {gerando ? 'Gerando referência...' : 'Criar série'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
      </div>

      <div className="card">
        <h2>Séries existentes</h2>
        {series.length === 0 && <p style={{ color: '#999' }}>Nenhuma série ainda.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {series.map((s) => (
            <div key={s.id} style={{ width: 140 }}>
              <img src={s.imagemReferenciaUrl} alt={s.nome} style={{ width: '100%', borderRadius: 8 }} />
              <div style={{ fontWeight: 600, marginTop: 4 }}>{s.nome}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{s.descricaoPersonagem.slice(0, 60)}...</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
