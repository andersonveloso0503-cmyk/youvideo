import { useState } from 'react';
import { upload } from '@vercel/blob/client';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Aceita tanto segundos direto ("90") quanto minuto:segundo ("1:30").
function paraSegundos(txt) {
  if (!txt) return 0;
  const s = String(txt).trim();
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map((n) => parseInt(n, 10) || 0);
    return m * 60 + sec;
  }
  return parseInt(s, 10) || 0;
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

      <TesteAvancadoReplicate />

      <TesteKlingReplicate />

      <TesteVisionStory />

      <div className="card">
        <h2>5. Ou gere o vídeo cantando fora do Youvideo</h2>
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
        <h2>6. Subir o vídeo pronto</h2>

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

// Teste avançado (Replicate, modelo bytedance/omni-human): a pessoa se mexe
// de verdade — corpo, gestos, cabeça — tipo o efeito do MusicLab. Bem mais
// caro que o teste barato (cobra por segundo de vídeo gerado), então só faz
// sentido usar depois que o teste barato já convenceu que vale investir.
function TesteAvancadoReplicate() {
  const [imagemArquivo, setImagemArquivo] = useState(null);
  const [audioArquivo, setAudioArquivo] = useState(null);
  const [confirmado, setConfirmado] = useState(false);

  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [resultadoUrl, setResultadoUrl] = useState('');
  const [erro, setErro] = useState(null);

  async function gerarTeste() {
    setErro(null);
    setResultadoUrl('');
    if (!imagemArquivo) return setErro('Escolha uma foto/imagem do personagem.');
    if (!audioArquivo) return setErro('Escolha o áudio da música (recorte um trecho curto, até 30s).');
    if (!confirmado) return setErro('Marque a caixinha confirmando que você sabe que esse teste é pago por segundo de vídeo.');

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

      setStatusMsg('Iniciando o teste avançado no Replicate (pode demorar mais que o barato)...');
      const iniciarRes = await fetch('/api/cantor-virtual-avancado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemUrl: imagemBlob.url, audioUrl: audioBlob.url }),
      });
      const iniciarData = await iniciarRes.json();
      if (!iniciarRes.ok) throw new Error(iniciarData.erro || 'Erro ao iniciar o teste');

      const { id } = iniciarData;
      const fim = Date.now() + 15 * 60 * 1000; // até 15 min de espera
      while (Date.now() < fim) {
        const checkRes = await fetch(`/api/cantor-virtual-avancado?id=${id}`);
        const checkData = await checkRes.json();
        if (!checkRes.ok) throw new Error(checkData.erro || 'Erro checando o teste');
        if (checkData.pronto) {
          setResultadoUrl(checkData.url);
          setStatusMsg('');
          return;
        }
        setStatusMsg(
          checkData.status === 'starting'
            ? 'Ligando a máquina de IA (pode levar alguns minutos)...'
            : 'Gerando o vídeo — a pessoa se movendo na cena (mais demorado que o teste barato)...'
        );
        await sleep(8000);
      }
      throw new Error('Demorou demais. Tente de novo.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="card" style={{ border: '1px solid #4f7cff' }}>
      <h2>2. 🎬 Teste avançado — pessoa se movendo na cena (tipo MusicLab)</h2>
      <p style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.5 }}>
        Esse aqui já se aproxima do efeito do MusicLab: a pessoa se mexe de verdade (corpo, cabeça, gestos) no
        ritmo da música, não é só a boca. Usa o modelo <strong>bytedance/omni-human</strong> no Replicate.
      </p>
      <p style={{ color: '#ff9d9d', fontSize: 13, lineHeight: 1.5 }}>
        ⚠️ <strong>Esse teste é pago de verdade</strong>: custa cerca de <strong>US$ 0,14 por segundo</strong> de
        vídeo gerado (uns R$0,75/s no câmbio de hoje). Um teste de 15 segundos fica em torno de <strong>R$11</strong>;
        o áudio precisa ter no máximo 30 segundos. Recorte um trechinho curto da música antes de subir aqui.
      </p>

      <label>Foto/imagem do personagem</label>
      <input type="file" accept="image/*" onChange={(e) => setImagemArquivo(e.target.files?.[0] || null)} />

      <label>Áudio da música (recorte até 30s)</label>
      <input type="file" accept="audio/*" onChange={(e) => setAudioArquivo(e.target.files?.[0] || null)} />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontWeight: 'normal' }}>
        <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} style={{ width: 'auto' }} />
        Sei que esse teste é pago por segundo de vídeo e quero gerar mesmo assim
      </label>

      <button disabled={rodando || !imagemArquivo || !audioArquivo || !confirmado} onClick={gerarTeste} style={{ marginTop: 8 }}>
        {rodando && <span className="spinner" />}
        {rodando ? 'Gerando teste avançado...' : 'Gerar vídeo de teste avançado'}
      </button>

      {statusMsg && <p style={{ color: '#9aa4b2', fontSize: 13, marginTop: 8 }}>{statusMsg}</p>}
      {erro && <div className="result-box">Erro: {erro}</div>}
      {resultadoUrl && (
        <div className="result-box">
          <video src={resultadoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          <p style={{ color: '#8fd6c1', fontSize: 13 }}>✅ Teste avançado pronto — compara com o teste barato e decide se vale o custo.</p>
        </div>
      )}
    </div>
  );
}

// Teste com kwaivgi/kling-lip-sync — diferente dos outros dois: não anima
// uma foto parada, precisa de um VÍDEO curto (2-10s) de uma pessoa já
// existente, e troca a sincronia da boca pra bater com o áudio novo.
function TesteKlingReplicate() {
  const [videoArquivo, setVideoArquivo] = useState(null);
  const [audioArquivo, setAudioArquivo] = useState(null);
  const [inicioCorte, setInicioCorte] = useState('');
  const [duracaoCorte, setDuracaoCorte] = useState(8);

  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [resultadoUrl, setResultadoUrl] = useState('');
  const [erro, setErro] = useState(null);

  async function gerarTeste() {
    setErro(null);
    setResultadoUrl('');
    if (!videoArquivo) return setErro('Escolha um vídeo curto (2-10s) de uma pessoa — não é foto, é vídeo mesmo.');
    if (!audioArquivo) return setErro('Escolha o áudio da música (até 5MB).');

    setRodando(true);
    try {
      setStatusMsg('Enviando o vídeo...');
      const videoBlob = await upload(videoArquivo.name, videoArquivo, {
        access: 'public',
        handleUploadUrl: '/api/video-upload',
      });

      setStatusMsg('Ajustando o vídeo automaticamente (resolução e duração exigidas pelo Kling)...');
      const ajusteRes = await fetch('/api/ajustar-video-kling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: videoBlob.url, segundos: Number(duracaoCorte) || 8 }),
      });
      const ajusteData = await ajusteRes.json();
      if (!ajusteRes.ok) throw new Error(ajusteData.erro || 'Erro ao ajustar o vídeo');

      setStatusMsg('Enviando o áudio...');
      const audioBlob = await upload(audioArquivo.name, audioArquivo, {
        access: 'public',
        handleUploadUrl: '/api/musica-audio-upload',
      });

      setStatusMsg('Cortando o áudio automaticamente (o Kling só aceita até 5MB e poucos segundos)...');
      const corteRes = await fetch('/api/cortar-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: audioBlob.url, segundos: Number(duracaoCorte) || 8, inicio: paraSegundos(inicioCorte) }),
      });
      const corteData = await corteRes.json();
      if (!corteRes.ok) throw new Error(corteData.erro || 'Erro ao cortar o áudio');

      setStatusMsg('Iniciando o teste no Replicate...');
      const iniciarRes = await fetch('/api/cantor-virtual-kling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: ajusteData.url, audioUrl: corteData.url }),
      });
      const iniciarData = await iniciarRes.json();
      if (!iniciarRes.ok) throw new Error(iniciarData.erro || 'Erro ao iniciar o teste');

      const { id } = iniciarData;
      const fim = Date.now() + 10 * 60 * 1000;
      while (Date.now() < fim) {
        const checkRes = await fetch(`/api/cantor-virtual-kling?id=${id}`);
        const checkData = await checkRes.json();
        if (!checkRes.ok) throw new Error(checkData.erro || 'Erro checando o teste');
        if (checkData.pronto) {
          setResultadoUrl(checkData.url);
          setStatusMsg('');
          return;
        }
        setStatusMsg(checkData.status === 'starting' ? 'Ligando a máquina de IA...' : 'Sincronizando a boca com o áudio...');
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
      <h2>3. 🎤 Teste Kling Lip-Sync (precisa de vídeo, não só foto)</h2>
      <p style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.5 }}>
        Esse modelo (kwaivgi/kling-lip-sync) não anima foto parada — ele pega um <strong>vídeo já existente</strong> de
        alguém (2 a 10 segundos, .mp4 ou .mov, até 100MB) e troca a sincronia da boca pra bater com a música nova.
        Se você não tiver um videozinho assim ainda, pula esse teste por enquanto.
      </p>
      <p style={{ color: '#9aa4b2', fontSize: 13, lineHeight: 1.5 }}>
        Pode subir o vídeo e a música do jeito que estiverem — o Youvideo ajusta a resolução do vídeo, corta os
        primeiros 8 segundos de ambos e comprime o áudio automaticamente antes de enviar (o Kling exige vídeo
        entre 512-2160px de largura, até 10s, e áudio até 5MB — não precisa mexer em nada na mão).
      </p>

      <label>Vídeo curto (2-10s) de uma pessoa</label>
      <input type="file" accept="video/*" onChange={(e) => setVideoArquivo(e.target.files?.[0] || null)} />

      <label>Áudio da música (pode ser o arquivo inteiro — cortamos aqui)</label>
      <input type="file" accept="audio/*" onChange={(e) => setAudioArquivo(e.target.files?.[0] || null)} />

      <label>Começar o corte a partir de (pula a introdução e pega direto a voz)</label>
      <input
        type="text"
        value={inicioCorte}
        onChange={(e) => setInicioCorte(e.target.value)}
        placeholder="Ex: 1:30 ou 90 (os dois valem 1 minuto e 30s)"
      />

      <label>Duração do corte (máximo 10s — limite do próprio Kling)</label>
      <input
        type="number"
        min="2"
        max="10"
        step="1"
        value={duracaoCorte}
        onChange={(e) => setDuracaoCorte(e.target.value)}
      />

      <button disabled={rodando || !videoArquivo || !audioArquivo} onClick={gerarTeste} style={{ marginTop: 8 }}>
        {rodando && <span className="spinner" />}
        {rodando ? 'Gerando teste...' : 'Gerar vídeo de teste'}
      </button>

      {statusMsg && <p style={{ color: '#9aa4b2', fontSize: 13, marginTop: 8 }}>{statusMsg}</p>}
      {erro && <div className="result-box">Erro: {erro}</div>}
      {resultadoUrl && (
        <div className="result-box">
          <video src={resultadoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          <p style={{ color: '#8fd6c1', fontSize: 13 }}>✅ Teste pronto.</p>
        </div>
      )}
    </div>
  );
}

// Opção VisionStory — serviço externo (não é Replicate) especializado em
// "Music Video": foto + música -> vídeo cantando com movimento de cena.
// Precisa da variável VISIONSTORY_API_KEY na Vercel (chave grátis em
// developers.visionstory.ai/api-keys, com 10 créditos de teste).
function TesteVisionStory() {
  const [imagemArquivo, setImagemArquivo] = useState(null);
  const [audioArquivo, setAudioArquivo] = useState(null);

  const [rodando, setRodando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [resultadoUrl, setResultadoUrl] = useState('');
  const [erro, setErro] = useState(null);

  async function gerarTeste() {
    setErro(null);
    setResultadoUrl('');
    if (!imagemArquivo) return setErro('Escolha uma foto/imagem do personagem.');
    if (!audioArquivo) return setErro('Escolha o áudio da música.');

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

      setStatusMsg('Iniciando o teste no VisionStory...');
      const iniciarRes = await fetch('/api/cantor-virtual-visionstory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagemUrl: imagemBlob.url, audioUrl: audioBlob.url }),
      });
      const iniciarData = await iniciarRes.json();
      if (!iniciarRes.ok) throw new Error(iniciarData.erro || 'Erro ao iniciar o teste');

      const { id } = iniciarData;
      const fim = Date.now() + 10 * 60 * 1000;
      while (Date.now() < fim) {
        const checkRes = await fetch(`/api/cantor-virtual-visionstory?id=${id}`);
        const checkData = await checkRes.json();
        if (!checkRes.ok) throw new Error(checkData.erro || 'Erro checando o teste');
        if (checkData.pronto) {
          setResultadoUrl(checkData.url);
          setStatusMsg('');
          return;
        }
        setStatusMsg('Gerando o vídeo no VisionStory...');
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
      <h2>4. 🎬 Teste VisionStory (Music Video — foto + música)</h2>
      <p style={{ color: '#9aa4b2', fontSize: 14, lineHeight: 1.5 }}>
        Serviço externo especializado exatamente nisso: foto + música → vídeo cantando com movimento de cena. Tem
        10 créditos grátis (uns 30s de teste) antes de cobrar.
      </p>
      <p style={{ color: '#9aa4b2', fontSize: 13, lineHeight: 1.5 }}>
        Precisa configurar a variável <code>VISIONSTORY_API_KEY</code> na Vercel primeiro (crie a chave grátis em{' '}
        <a href="https://developers.visionstory.ai/api-keys" target="_blank" rel="noreferrer" style={{ color: '#4f7cff' }}>
          developers.visionstory.ai/api-keys
        </a>
        ). Sem isso, o botão abaixo vai dar erro avisando que falta a chave.
      </p>

      <label>Foto/imagem do personagem</label>
      <input type="file" accept="image/*" onChange={(e) => setImagemArquivo(e.target.files?.[0] || null)} />

      <label>Áudio da música</label>
      <input type="file" accept="audio/*" onChange={(e) => setAudioArquivo(e.target.files?.[0] || null)} />

      <button disabled={rodando || !imagemArquivo || !audioArquivo} onClick={gerarTeste} style={{ marginTop: 8 }}>
        {rodando && <span className="spinner" />}
        {rodando ? 'Gerando teste...' : 'Gerar vídeo de teste'}
      </button>

      {statusMsg && <p style={{ color: '#9aa4b2', fontSize: 13, marginTop: 8 }}>{statusMsg}</p>}
      {erro && <div className="result-box">Erro: {erro}</div>}
      {resultadoUrl && (
        <div className="result-box">
          <video src={resultadoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          <p style={{ color: '#8fd6c1', fontSize: 13 }}>✅ Teste pronto.</p>
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
