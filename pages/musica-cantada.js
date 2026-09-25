import { useState } from 'react';
import { upload } from '@vercel/blob/client';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MusicaCantada() {
  const [titulo, setTitulo] = useState('');
  const [arquivoVideo, setArquivoVideo] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [erro, setErro] = useState(null);

  async function enviarVideo() {
    setErro(null);
    if (!arquivoVideo) return setErro('Escolha o vídeo já pronto (gerado no Musicful, ilovesong.ai etc.)');

    setEnviando(true);
    try {
      const blob = await upload(arquivoVideo.name, arquivoVideo, {
        access: 'public',
        handleUploadUrl: '/api/video-upload',
      });
      setVideoUrl(blob.url);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container">
      <h1>Cantor Virtual</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a>
      </p>

      <TesteBaratoReplicate />

      <div className="card">
        <h2>2. Ou gere o vídeo cantando fora do Youvideo</h2>
        <p style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.5 }}>
          Se o teste acima não ficou bom o suficiente, dá pra gerar num site pago com mais qualidade
          (foto do personagem + áudio da música, escolha o tipo "Singing"):
        </p>
        <ul style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.8, marginTop: 0 }}>
          <li><a href="https://www.musicful.ai/ai-music-video-maker/" target="_blank" rel="noreferrer" style={{ color: '#4f7cff' }}>Musicful — AI Music Video Maker</a></li>
          <li><a href="https://ilovesong.ai/" target="_blank" rel="noreferrer" style={{ color: '#4f7cff' }}>ilovesong.ai — AI Singer Video Generator</a></li>
        </ul>
        <p style={{ color: '#9aa4b2', fontSize: 14 }}>Depois, baixe o vídeo pronto e suba ele abaixo.</p>
      </div>

      <div className="card">
        <h2>3. Subir o vídeo pronto</h2>

        <label>Título (opcional, só organização)</label>
        <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fé Que Levanta" />

        <label>Arquivo de vídeo</label>
        <input type="file" accept="video/*" onChange={(e) => setArquivoVideo(e.target.files?.[0] || null)} />
        <button disabled={enviando || !arquivoVideo} onClick={enviarVideo} style={{ marginTop: 8 }}>
          {enviando && <span className="spinner" />}
          {enviando ? 'Enviando...' : 'Enviar vídeo'}
        </button>

        {erro && <div className="result-box">Erro: {erro}</div>}
        {videoUrl && (
          <div className="result-box">
            <video src={videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
            <PublicarSocialBotao midiaUrl={videoUrl} legenda={titulo} />
            <SalvarProjetoBotao titulo={titulo} videoUrl={videoUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

// Teste rápido e barato (Replicate, modelo cjwbw/sadtalker) pra ver a
// qualidade antes de gastar em site pago. Sobe uma foto do personagem +
// o áudio da música e gera um vídeo curto dele "cantando" (boca mexendo
// no ritmo do áudio). Não é tão realista quanto os modelos caros
// (omni-human, sync/lipsync-2, kling-lip-sync), mas serve pra decidir se
// vale a pena investir nisso.
function TesteBaratoReplicate() {
  const [imagemArquivo, setImagemArquivo] = useState(null);
  const [audioArquivo, setAudioArquivo] = useState(null);
  const [qualidade, setQualidade] = useState('padrao');

  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [resultadoUrl, setResultadoUrl] = useState('');
  const [erro, setErro] = useState(null);

  async function gerarTeste() {
    setErro(null);
    setResultadoUrl('');
    if (!imagemArquivo) return setErro('Escolha uma foto/imagem do personagem (pode ser a mesma já gerada no Youvideo).');
    if (!audioArquivo) return setErro('Escolha o áudio da música (o .mp3 gerado no Suno, por exemplo).');

    setRodando(true);
    try {
      setStatusMsg('Enviando a imagem...');
      const imagemBlob = await upload(imagemArquivo.name, imagemArquivo, {
        access: 'public',
        handleUploadUrl: '/api/imagem-upload',
      });

      setStatusMsg('Enviando o áudio...');
      const audioBlob = await upload(audioArquivo.name, audioArquivo, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });

      setStatusMsg('Iniciando o teste no Replicate...');
      const iniciarRes = await fetch('/api/cantor-virtual-teste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemUrl: imagemBlob.url, audioUrl: audioBlob.url, qualidade }),
      });
      const iniciarData = await iniciarRes.json();
      if (!iniciarRes.ok) throw new Error(iniciarData.erro || 'Erro ao iniciar o teste');

      const { id } = iniciarData;
      const fim = Date.now() + 10 * 60 * 1000; // até 10 min de espera
      while (Date.now() < fim) {
        const checkRes = await fetch(`/api/cantor-virtual-teste?id=${id}`);
        const checkData = await checkRes.json();
        if (!checkRes.ok) throw new Error(checkData.erro || 'Erro checando o teste');
        if (checkData.pronto) {
          setResultadoUrl(checkData.url);
          setStatusMsg('');
          return;
        }
        setStatusMsg(
          checkData.status === 'starting'
            ? 'Ligando a máquina de IA (pode levar 1-3 min)...'
            : 'Gerando o vídeo de teste...'
        );
        await sleep(6000);
      }
      throw new Error('Demorou demais. Tente de novo.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="card">
      <h2>1. 🧪 Teste barato aqui mesmo (antes de gastar)</h2>
      <p style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.5 }}>
        Sobe uma foto do personagem e o áudio da música, e o Youvideo gera um vídeo curto de teste com a boca
        mexendo no ritmo da música. Usa o mesmo Replicate já configurado no "Cover" — custa só alguns centavos
        por teste. Serve pra ver se vale a pena investir num site pago com mais qualidade.
      </p>

      <label>Foto/imagem do personagem</label>
      <input type="file" accept="image/*" onChange={(e) => setImagemArquivo(e.target.files?.[0] || null)} />

      <label>Áudio da música</label>
      <input type="file" accept="audio/*" onChange={(e) => setAudioArquivo(e.target.files?.[0] || null)} />

      <label>Qualidade</label>
      <select value={qualidade} onChange={(e) => setQualidade(e.target.value)}>
        <option value="padrao">Padrão (mais rápido e barato)</option>
        <option value="alta">Alta (realce de rosto — mais lento)</option>
      </select>

      <button disabled={rodando || !imagemArquivo || !audioArquivo} onClick={gerarTeste} style={{ marginTop: 8 }}>
        {rodando && <span className="spinner" />}
        {rodando ? 'Gerando teste...' : 'Gerar vídeo de teste'}
      </button>

      {statusMsg && <p style={{ color: '#9aa4b2', fontSize: 13, marginTop: 8 }}>{statusMsg}</p>}
      {erro && <div className="result-box">Erro: {erro}</div>}
      {resultadoUrl && (
        <div className="result-box">
          <video src={resultadoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          <p style={{ color: '#8fd6c1', fontSize: 13 }}>✅ Teste pronto — dá pra baixar e avaliar a qualidade.</p>
        </div>
      )}
    </div>
  );
}

function SalvarProjetoBotao({ titulo, videoUrl }) {
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null);

  async function salvar() {
    setSalvando(true);
    setStatus(null);
    try {
      const res = await fetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo || 'Cantor Virtual (sem título)',
          videoUrl,
          canal: 'musica',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      setStatus('ok');
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button disabled={salvando} onClick={salvar} style={{ marginTop: 0 }}>
        {salvando && <span className="spinner" />}
        {salvando ? 'Salvando...' : 'Salvar projeto'}
      </button>
      {status === 'ok' && <div style={{ fontSize: 12, marginTop: 6, color: '#8fd6c1' }}>Salvo! Vê em "Meus Projetos" no topo do painel.</div>}
      {status && status !== 'ok' && <div style={{ fontSize: 12, marginTop: 6, color: '#ff9d9d' }}>{status}</div>}
    </div>
  );
}

function PublicarSocialBotao({ midiaUrl, legenda }) {
  const [publicando, setPublicando] = useState(false);
  const [resultadoPub, setResultadoPub] = useState(null);

  async function publicar() {
    setPublicando(true);
    setResultadoPub(null);
    try {
      const res = await fetch('/api/publicar-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'video', midiaUrl, legenda }),
      });
      const data = await res.json();
      setResultadoPub(data);
    } catch (err) {
      setResultadoPub({ erro: err.message });
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
      {resultadoPub && (
        <div style={{ fontSize: 12, marginTop: 6 }}>
          {resultadoPub.facebook?.erro ? (
            <div style={{ color: '#ff9d9d' }}>Facebook: {resultadoPub.facebook.erro}</div>
          ) : (
            <div style={{ color: '#8fd6c1' }}>Facebook: publicado ✓</div>
          )}
          {resultadoPub.instagram?.erro ? (
            <div style={{ color: '#ff9d9d' }}>Instagram: {resultadoPub.instagram.erro}</div>
          ) : (
            <div style={{ color: '#8fd6c1' }}>Instagram: publicado ✓</div>
          )}
        </div>
      )}
    </div>
  );
}
