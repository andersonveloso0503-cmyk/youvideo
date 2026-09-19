import { useState, useEffect } from 'react';

export default function OracaoMatinal() {
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [series, setSeries] = useState([]);
  const [serieId, setSerieId] = useState('');

  const [status, setStatus] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    fetch('/api/serie-listar')
      .then((r) => r.json())
      .then((data) => setSeries(data.series || []))
      .catch(() => setSeries([]));
  }, []);

  const imagemEscolhida = serieId ? series.find((s) => s.id === serieId)?.imagemReferenciaUrl : imagemUrl;

  async function gerar() {
    setErro(null);
    setResultado(null);
    if (!texto.trim()) return setErro('Escreva o texto da oração');
    if (!imagemEscolhida) return setErro('Escolha uma série ou cole uma URL de imagem');

    try {
      setStatus('Gerando a narração...');
      const vozRes = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const vozData = await vozRes.json();
      if (!vozRes.ok) throw new Error(vozData.error);

      const totalPedacos = vozData.audioSegments?.length || 1;
      setStatus(
        totalPedacos > 1
          ? `Gerando ${totalPedacos} pedaços de vídeo falado (pode levar alguns minutos)...`
          : 'Gerando o vídeo falado (pode levar 1-2 minutos)...'
      );

      const videoRes = await fetch('/api/gerar-video-falado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemUrl: imagemEscolhida, audioSegments: vozData.audioSegments }),
      });
      const videoData = await videoRes.json();
      if (!videoRes.ok) throw new Error(videoData.error);

      if (videoData.videoUrl) {
        setResultado(videoData.videoUrl);
        setStatus(null);
        return;
      }

      // Vários pedaços: precisa esperar a montagem final juntando tudo.
      setStatus('Juntando os pedaços na sequência certa...');
      let tentativas = 0;
      while (tentativas < 60) {
        await new Promise((r) => setTimeout(r, 5000));
        const check = await fetch(`/api/gerar-video-falado?id=${videoData.renderId}`).then((r) => r.json());
        if (check.status === 'done') {
          setResultado(check.videoUrl);
          setStatus(null);
          return;
        }
        if (check.status === 'failed') {
          throw new Error(`Falha ao juntar os pedaços: ${check.erro || 'motivo não informado'}`);
        }
        tentativas++;
      }
      throw new Error('Demorou demais pra juntar os pedaços — confira depois manualmente.');
    } catch (err) {
      setErro(err.message);
      setStatus(null);
    }
  }

  return (
    <div className="container">
      <h1>Oração matinal falada</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a> ·{' '}
        <a href="/series" style={{ color: '#4f7cff' }}>Séries de personagens</a>
      </p>

      <div className="card">
        <h2>Criar uma oração com alguém falando</h2>
        <p style={{ fontSize: 13, color: '#999' }}>
          Usa uma imagem de referência (do /series ou uma URL sua) + a narração gerada pela
          ElevenLabs, e sincroniza os lábios com a fala (via D-ID). Textos longos são divididos
          automaticamente e juntados no fim, sem perder pedaço.
        </p>

        <label>Título (opcional, só organização)</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Oração da manhã de segunda-feira" />

        <label>Personagem (de uma série já criada)</label>
        <select value={serieId} onChange={(e) => setSerieId(e.target.value)}>
          <option value="">Nenhuma — vou colar uma URL de imagem</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>

        {!serieId && (
          <>
            <label>URL da imagem (rosto de frente, bem iluminado)</label>
            <input type="text" value={imagemUrl} onChange={(e) => setImagemUrl(e.target.value)} placeholder="https://..." />
          </>
        )}

        {imagemEscolhida && (
          <img src={imagemEscolhida} alt="referência" style={{ width: 120, borderRadius: 8, marginTop: 8 }} />
        )}

        <label>Texto da oração (pode ser longo, até uns 20 minutos)</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pai, hoje eu venho a Ti..."
          style={{ minHeight: 200 }}
        />

        <button disabled={!!status} onClick={gerar} style={{ marginTop: 12 }}>
          {status && <span className="spinner" />}
          {status || 'Gerar vídeo falado'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {resultado && (
          <div className="result-box">
            <video src={resultado} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          </div>
        )}
      </div>
    </div>
  );
}
