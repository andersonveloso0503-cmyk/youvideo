import { useState, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

const ESTILOS = [
  { id: 'biblico_classico', label: 'Pinturas bíblicas clássicas' },
  { id: 'cinematografico', label: 'Ilustração cinematográfica moderna' },
  { id: 'aquarela', label: 'Aquarela suave' },
];

const STATUS_MUSICA = {
  pendente: 'esperando alinhar',
  alinhado: 'esperando gerar cena',
  cenas_ok: 'esperando gerar imagem',
  imagem_ok: 'pronta',
};

const STATUS_MEDLEY = {
  coletando: 'ainda recebendo músicas',
  processando: 'processando as músicas uma por uma',
  montando: 'juntando tudo e montando o vídeo final...',
  renderizado: 'pronto! na fila de publicação',
  concluido: 'publicado ✅',
  erro: 'deu erro',
};

export default function Medley() {
  const [titulo, setTitulo] = useState('');
  const [estilo, setEstilo] = useState('cinematografico');
  const [formato, setFormato] = useState('longo');
  const [textoThumbnail, setTextoThumbnail] = useState('');
  const [medleyAtualId, setMedleyAtualId] = useState(null);

  const [letra, setLetra] = useState('');
  const [arquivoAudio, setArquivoAudio] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [totalMusicasAdicionadas, setTotalMusicasAdicionadas] = useState(0);

  const [medleys, setMedleys] = useState([]);

  async function carregarMedleys() {
    try {
      const res = await fetch('/api/medley-listar');
      const data = await res.json();
      setMedleys(data.medleys || []);
    } catch {
      // silencioso
    }
  }

  useEffect(() => {
    carregarMedleys();
    const intervalo = setInterval(carregarMedleys, 15000);
    return () => clearInterval(intervalo);
  }, []);

  async function criarMedley() {
    setMensagem(null);
    if (!titulo) return setMensagem({ erro: 'Preencha o título do medley' });
    try {
      const res = await fetch('/api/medley-criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, estilo, formato, textoThumbnail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMedleyAtualId(data.id);
      setTotalMusicasAdicionadas(0);
      setMensagem({ ok: `Medley "${titulo}" criado! Agora adicione as músicas uma por uma.` });
      carregarMedleys();
    } catch (err) {
      setMensagem({ erro: err.message });
    }
  }

  async function adicionarMusica() {
    setMensagem(null);
    if (!medleyAtualId) return setMensagem({ erro: 'Crie o medley primeiro' });
    if (!arquivoAudio) return setMensagem({ erro: 'Escolha o arquivo de áudio dessa música' });
    if (!letra.trim()) return setMensagem({ erro: 'Cole a letra dessa música' });

    setEnviando(true);
    try {
      const blob = await upload(arquivoAudio.name, arquivoAudio, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });

      const res = await fetch('/api/medley-adicionar-musica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medleyId: medleyAtualId, audioUrl: blob.url, letra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTotalMusicasAdicionadas(data.totalMusicas);
      setMensagem({ ok: `Música ${data.totalMusicas} adicionada ao medley!` });
      setLetra('');
      setArquivoAudio(null);
      carregarMedleys();
    } catch (err) {
      setMensagem({ erro: err.message });
    } finally {
      setEnviando(false);
    }
  }

  async function finalizarMedley() {
    setMensagem(null);
    try {
      const res = await fetch('/api/medley-finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medleyId: medleyAtualId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMensagem({ ok: 'Medley finalizado! Agora é só deixar a fila processar sozinha.' });
      setMedleyAtualId(null);
      carregarMedleys();
    } catch (err) {
      setMensagem({ erro: err.message });
    }
  }

  return (
    <div className="container">
      <h1>Medley de músicas</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a> ·{' '}
        <a href="/musica-fila" style={{ color: '#4f7cff' }}>Fila de músicas</a>
      </p>

      {!medleyAtualId && (
        <div className="card">
          <h2>1. Criar um novo medley</h2>
          <label>Título do medley</label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Uma hora de louvor" />

          <div className="row">
            <div>
              <label>Estilo visual</label>
              <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
                {ESTILOS.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Formato</label>
              <select value={formato} onChange={(e) => setFormato(e.target.value)}>
                <option value="longo">Vídeo longo</option>
                <option value="short">Short (vertical)</option>
              </select>
            </div>
          </div>

          <label>Texto de destaque pra thumbnail (opcional)</label>
          <input type="text" value={textoThumbnail} onChange={(e) => setTextoThumbnail(e.target.value)} placeholder="Ex: 1 HORA DE LOUVOR" />

          <button onClick={criarMedley} style={{ marginTop: 12 }}>Criar medley</button>
        </div>
      )}

      {medleyAtualId && (
        <div className="card">
          <h2>2. Adicionar músicas ao medley "{titulo}" ({totalMusicasAdicionadas} já adicionadas)</h2>
          <p style={{ fontSize: 13, color: '#999' }}>
            Cada música vira 1 imagem só (a que combinar melhor com a letra dela inteira), ficando na tela
            o tempo todo daquela música — assim um medley longo não gera dezenas de imagens.
          </p>

          <label>Áudio dessa música (baixado do Suno)</label>
          <input type="file" accept="audio/*" onChange={(e) => setArquivoAudio(e.target.files?.[0] || null)} />

          <label>Letra dessa música (com [Verse]/[Chorus])</label>
          <textarea
            value={letra}
            onChange={(e) => setLetra(e.target.value)}
            placeholder={'[Verse]\n...'}
            style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 13 }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={enviando} onClick={adicionarMusica}>
              {enviando ? 'Enviando...' : 'Adicionar essa música ao medley'}
            </button>
            <button disabled={!totalMusicasAdicionadas} onClick={finalizarMedley} style={{ background: '#2e7d32' }}>
              Finalizar medley e processar
            </button>
          </div>

          {mensagem?.ok && <div className="result-box">{mensagem.ok}</div>}
          {mensagem?.erro && <div className="result-box">Erro: {mensagem.erro}</div>}
        </div>
      )}

      <div className="card">
        <h2>Medleys</h2>
        {medleys.length === 0 && <p style={{ color: '#999' }}>Nenhum medley ainda.</p>}
        {medleys.map((m) => (
          <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
            <b>{m.titulo}</b> — {m.totalMusicas} música(s)
            <div style={{ fontSize: 13, color: m.status === 'erro' ? '#ff9d9d' : '#aaa' }}>
              {STATUS_MEDLEY[m.status] || m.status}
              {m.erro ? ` — ${m.erro}` : ''}
            </div>
            {m.status === 'processando' && (
              <div style={{ fontSize: 12, color: '#777' }}>
                {m.musicasStatus.map((s, i) => `#${i + 1}: ${STATUS_MUSICA[s] || s}`).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
