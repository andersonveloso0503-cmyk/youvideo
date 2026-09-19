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
  const [ambiente, setAmbiente] = useState('sandbox');
  const [letra, setLetra] = useState('');
  const [textoThumbnail, setTextoThumbnail] = useState('');
  const [arquivoAudio, setArquivoAudio] = useState(null);
  const [sugerindoTitulo, setSugerindoTitulo] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [fila, setFila] = useState([]);
  const [processandoAgora, setProcessandoAgora] = useState(false);
  const [mensagemProcessar, setMensagemProcessar] = useState(null);

  async function carregarFila() {
    try {
      const res = await fetch('/api/musica-fila-listar');
      const data = await res.json();
      setFila(data.fila || []);
    } catch {
      // silencioso — a lista só não atualiza dessa vez
    }
  }

  async function processarAgora() {
    setProcessandoAgora(true);
    setMensagemProcessar(null);
    try {
      const res = await fetch('/api/musica-fila-processar');
      const data = await res.json();
      if (data.mensagem) setMensagemProcessar(data.mensagem);
      else if (data.error) setMensagemProcessar(`Erro: ${data.error}`);
      else setMensagemProcessar('Avançou uma etapa.');
      carregarFila();
    } catch (err) {
      setMensagemProcessar(`Erro: ${err.message}`);
    } finally {
      setProcessandoAgora(false);
    }
  }

  useEffect(() => {
    carregarFila();
    const intervalo = setInterval(carregarFila, 15000);
    return () => clearInterval(intervalo);
  }, []);

  async function sugerirTitulo() {
    setSugerindoTitulo(true);
    try {
      const res = await fetch('/api/sugerir-titulo-musica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letra }),
      });
      const data = await res.json();
      if (res.ok && data.titulo) setTitulo(data.titulo);
    } catch {
      // silencioso — o usuário pode digitar o título na mão se isso falhar
    } finally {
      setSugerindoTitulo(false);
    }
  }

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
        body: JSON.stringify({ audioUrl: blob.url, letra, titulo, estilo, formato, textoThumbnail, ambiente }),
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

        <label>Montagem</label>
        <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
          <option value="sandbox">Testar (Sandbox — grátis, sai com marca d'água)</option>
          <option value="production">Publicar de verdade (Produção — gasta crédito, sem marca d'água)</option>
        </select>

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
        <button disabled={sugerindoTitulo || !letra.trim()} onClick={sugerirTitulo} style={{ marginTop: 8 }}>
          {sugerindoTitulo && <span className="spinner" />}
          {sugerindoTitulo ? 'Pensando...' : 'Sugerir título (baseado na letra)'}
        </button>

        <button disabled={enviando} onClick={adicionarNaFila} style={{ marginTop: 12 }}>
          {enviando ? 'Enviando...' : 'Adicionar à fila'}
        </button>

        {mensagem?.ok && <div className="result-box">{mensagem.ok}</div>}
        {mensagem?.erro && <div className="result-box">Erro: {mensagem.erro}</div>}
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Fila atual
          <button
            style={{ marginTop: 0, fontSize: 13, padding: '6px 12px' }}
            disabled={processandoAgora}
            onClick={processarAgora}
          >
            {processandoAgora && <span className="spinner" />}
            {processandoAgora ? 'Processando...' : '↻ Processar agora'}
          </button>
        </h2>
        {mensagemProcessar && <div className="result-box">{mensagemProcessar}</div>}
        {fila.length === 0 && <p style={{ color: '#999' }}>Nenhuma música na fila ainda.</p>}
        {fila.map((item) => (
          <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>
            <b>{item.titulo}</b>
            <div style={{ fontSize: 13, color: item.status === 'erro' ? '#ff9d9d' : '#aaa' }}>
              {STATUS_LABEL[item.status] || item.status}
              {item.erro ? ` — ${item.erro}` : ''}
            </div>

            {item.videoUrl && (
              <FormatoSwitcher item={item} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormatoSwitcher({ item }) {
  const [formatoAtivo, setFormatoAtivo] = useState(item.formato);
  const [videosPorFormato, setVideosPorFormato] = useState({ [item.formato]: item.videoUrl });
  const [carregando, setCarregando] = useState(null);
  const [erro, setErro] = useState(null);

  async function trocarFormato(novoFormato) {
    setErro(null);
    if (videosPorFormato[novoFormato]) {
      setFormatoAtivo(novoFormato);
      return;
    }

    setCarregando(novoFormato);
    try {
      const res = await fetch('/api/reformatar-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colecao: 'musica_fila', itemId: item.id, novoFormato, ambiente: 'production' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      let tentativas = 0;
      while (tentativas < 40) {
        await new Promise((r) => setTimeout(r, 5000));
        const check = await fetch(`/api/assemble-video?id=${data.renderId}&ambiente=production`).then((r) => r.json());
        if (check.status === 'done') {
          setVideosPorFormato((v) => ({ ...v, [novoFormato]: check.videoUrl }));
          setFormatoAtivo(novoFormato);
          setCarregando(null);
          return;
        }
        if (check.status === 'failed') throw new Error(check.erro || 'Falha na montagem');
        tentativas++;
      }
      throw new Error('Demorou demais — tenta de novo daqui a pouco.');
    } catch (err) {
      setErro(err.message);
      setCarregando(null);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          style={{ marginTop: 0, opacity: formatoAtivo === 'longo' ? 1 : 0.6 }}
          disabled={carregando === 'longo'}
          onClick={() => trocarFormato('longo')}
        >
          {carregando === 'longo' && <span className="spinner" />}
          Horizontal
        </button>
        <button
          style={{ marginTop: 0, opacity: formatoAtivo === 'short' ? 1 : 0.6 }}
          disabled={carregando === 'short'}
          onClick={() => trocarFormato('short')}
        >
          {carregando === 'short' && <span className="spinner" />}
          Vertical
        </button>
      </div>
      {erro && <div className="result-box">Erro: {erro}</div>}
      {videosPorFormato[formatoAtivo] && (
        <>
          <video
            key={videosPorFormato[formatoAtivo]}
            src={videosPorFormato[formatoAtivo]}
            controls
            style={{ width: '100%', maxWidth: formatoAtivo === 'short' ? 220 : 400, borderRadius: 6, marginTop: 8 }}
          />
          <PublicarSocialBotao midiaUrl={videosPorFormato[formatoAtivo]} legenda={item.titulo} />
        </>
      )}
    </div>
  );
}

function PublicarSocialBotao({ midiaUrl, legenda }) {
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function publicar() {
    setPublicando(true);
    setResultado(null);
    try {
      const res = await fetch('/api/publicar-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'video', midiaUrl, legenda }),
      });
      const data = await res.json();
      setResultado(data);
    } catch (err) {
      setResultado({ erro: err.message });
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button disabled={publicando} onClick={publicar} style={{ marginTop: 0 }}>
        {publicando && <span className="spinner" />}
        {publicando ? 'Publicando...' : 'Publicar no Facebook e Instagram'}
      </button>
      {resultado && (
        <div style={{ fontSize: 12, marginTop: 6 }}>
          {resultado.facebook?.erro ? (
            <div style={{ color: '#ff9d9d' }}>Facebook: {resultado.facebook.erro}</div>
          ) : (
            <div style={{ color: '#8fd6c1' }}>Facebook: publicado ✓</div>
          )}
          {resultado.instagram?.erro ? (
            <div style={{ color: '#ff9d9d' }}>Instagram: {resultado.instagram.erro}</div>
          ) : (
            <div style={{ color: '#8fd6c1' }}>Instagram: publicado ✓</div>
          )}
        </div>
      )}
    </div>
  );
}
