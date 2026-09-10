import { useState, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

const ESTILOS = [
  { id: 'biblico_classico', label: 'Pinturas bíblicas clássicas' },
  { id: 'cinematografico', label: 'Ilustração cinematográfica moderna' },
  { id: 'aquarela', label: 'Aquarela suave' },
];

const STATUS_LABEL = {
  pendente: 'na fila, esperando alinhar a letra',
  alinhado: 'letra alinhada, esperando gerar cenas',
  cenas_ok: 'cenas escritas, esperando gerar imagens',
  imagens_ok: 'imagens prontas, esperando montar o vídeo',
  montando: 'montando o vídeo na Shotstack...',
  renderizado: 'pronta! esperando a vez de publicar (1 por dia)',
  concluido: 'publicada no YouTube ✅',
  erro: 'deu erro nessa música',
};

export default function MusicaFila() {
  const [titulo, setTitulo] = useState('');
  const [estilo, setEstilo] = useState('cinematografico');
  const [formato, setFormato] = useState('longo');
  const [letra, setLetra] = useState('');
  const [textoThumbnail, setTextoThumbnail] = useState('');
  const [arquivoAudio, setArquivoAudio] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [fila, setFila] = useState([]);

  async function carregarFila() {
    try {
      const res = await fetch('/api/musica-fila-listar');
      const data = await res.json();
      setFila(data.fila || []);
    } catch {
      // silencioso — a lista só não atualiza dessa vez
    }
  }

  useEffect(() => {
    carregarFila();
    const intervalo = setInterval(carregarFila, 15000);
    return () => clearInterval(intervalo);
  }, []);

  async function adicionarNaFila() {
    setMensagem(null);
    if (!arquivoAudio) return setMensagem({ erro: 'Escolha o arquivo de áudio baixado do Suno primeiro' });
    if (!letra.trim()) return setMensagem({ erro: 'Cole a letra da música primeiro' });
    if (!titulo) return setMensagem({ erro: 'Preencha o título' });

    setEnviando(true);
    try {
      const blob = await upload(arquivoAudio.name, arquivoAudio, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });

      const res = await fetch('/api/musica-fila-adicionar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: blob.url, letra, titulo, estilo, formato, textoThumbnail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMensagem({ ok: `"${titulo}" entrou na fila!` });
      setTitulo('');
      setLetra('');
      setTextoThumbnail('');
      setArquivoAudio(null);
      carregarFila();
    } catch (err) {
      setMensagem({ erro: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container">
      <h1>Fila de músicas</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a> ·{' '}
        <a href="/musica" style={{ color: '#4f7cff' }}>Criar uma música manualmente</a>
      </p>

      <div className="card">
        <h2>Adicionar música à fila</h2>
        <p style={{ fontSize: 13, color: '#999' }}>
          Suba a música, a fila processa sozinha (letra → cenas → imagens → vídeo → thumbnail) e libera
          1 vídeo por dia no canal de música automaticamente.
        </p>

        <label>Título</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Graça sobre graça" />

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
        <input type="text" value={textoThumbnail} onChange={(e) => setTextoThumbnail(e.target.value)} placeholder="Ex: GRAÇA SOBRE GRAÇA" />

        <label>Áudio (baixado do Suno)</label>
        <input type="file" accept="audio/*" onChange={(e) => setArquivoAudio(e.target.files?.[0] || null)} />

        <label>Letra da música (com [Verse]/[Chorus])</label>
        <textarea
          value={letra}
          onChange={(e) => setLetra(e.target.value)}
          placeholder={'[Verse]\nEle é a luz que não se apaga\n[Chorus]\nGraça sobre graça, é o que Ele me dá'}
          style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 13 }}
        />

        <button disabled={enviando} onClick={adicionarNaFila} style={{ marginTop: 12 }}>
          {enviando ? 'Enviando...' : 'Adicionar à fila'}
        </button>

        {mensagem?.ok && <div className="result-box">{mensagem.ok}</div>}
        {mensagem?.erro && <div className="result-box">Erro: {mensagem.erro}</div>}
      </div>

      <div className="card">
        <h2>Fila atual</h2>
        {fila.length === 0 && <p style={{ color: '#999' }}>Nenhuma música na fila ainda.</p>}
        {fila.map((item) => (
          <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
            <b>{item.titulo}</b>
            <div style={{ fontSize: 13, color: item.status === 'erro' ? '#ff9d9d' : '#aaa' }}>
              {STATUS_LABEL[item.status] || item.status}
              {item.erro ? ` — ${item.erro}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
