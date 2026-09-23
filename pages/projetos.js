import { useEffect, useState } from 'react';
import { upload } from '@vercel/blob/client';

async function compartilhar(arquivo, titulo, setStatus) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: titulo || 'Youvideo' });
    } else {
      setStatus('sem-suporte');
    }
  } catch (err) {
    if (err.name !== 'AbortError') setStatus('erro:' + err.message);
  }
}

export default function Projetos() {
  const [projetos, setProjetos] = useState(null);
  const [erro, setErro] = useState(null);
  const [arquivosProntos, setArquivosProntos] = useState({});
  const [statusEnvio, setStatusEnvio] = useState({});
  const [reformatando, setReformatando] = useState({}); // { [projetoId]: { status, renderId, videoUrl, erro } }

  const [tituloExterno, setTituloExterno] = useState('');
  const [arquivoExterno, setArquivoExterno] = useState(null);
  const [enviandoExterno, setEnviandoExterno] = useState(false);
  const [erroExterno, setErroExterno] = useState(null);

  function recarregarProjetos() {
    fetch('/api/list-projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setProjetos(data.projetos || []);
      })
      .catch((err) => setErro(err.message));
  }

  async function adicionarProjetoExterno() {
    setErroExterno(null);
    if (!arquivoExterno) return setErroExterno('Escolha o arquivo de vídeo primeiro.');
    if (!tituloExterno) return setErroExterno('Dá um título pra esse vídeo.');

    setEnviandoExterno(true);
    try {
      const blob = await upload(arquivoExterno.name, arquivoExterno, {
        access: 'public',
        handleUploadUrl: '/api/video-upload',
      });

      const res = await fetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: tituloExterno,
          videoUrl: blob.url,
          estilo: 'externo',
          formato: 'externo',
          descricao: 'Vídeo trazido de fora (não gerado pelo Youvideo)',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar o projeto');

      setTituloExterno('');
      setArquivoExterno(null);
      recarregarProjetos();
    } catch (err) {
      setErroExterno(err.message);
    } finally {
      setEnviandoExterno(false);
    }
  }

  useEffect(() => {
    fetch('/api/list-projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const lista = data.projetos || [];
        setProjetos(lista);
        // Baixa cada vídeo em segundo plano assim que a lista carrega, pra
        // "Enviar" poder abrir o menu nativo na hora quando você clicar
        // (no iPhone, esperar o download DEPOIS do clique bloqueia o menu).
        lista.forEach((p) => {
          if (!p.videoUrl) return;
          fetch(`/api/download-video?url=${encodeURIComponent(p.videoUrl)}`)
            .then((r) => {
              if (!r.ok) throw new Error('Falha ao preparar');
              return r.blob();
            })
            .then((blob) => {
              const arquivo = new File([blob], 'youvideo.mp4', { type: 'video/mp4' });
              setArquivosProntos((prev) => ({ ...prev, [p.id]: arquivo }));
            })
            .catch(() => {});
        });
      })
      .catch((err) => setErro(err.message));
  }, []);

  async function reformatarParaVertical(p) {
    const id = p.id;
    setReformatando((prev) => ({ ...prev, [id]: { status: "enviando" } }));
    try {
      // 1ª tentativa: o próprio projeto já guarda áudio/cenas (vídeos salvos
      // depois da correção do /desenho e telas parecidas)
      let res = await fetch("/api/reformatar-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colecao: "projeto", itemId: id, novoFormato: "short", ambiente: "production" }),
      });
      let data = await res.json();

      // 2ª tentativa (fallback): projetos antigos, sem os dados salvos —
      // procura o item original na fila pelo tema
      if (!res.ok) {
        setReformatando((prev) => ({ ...prev, [id]: { status: "localizando" } }));
        const locRes = await fetch(`/api/localizar-item-fila?tema=${encodeURIComponent(p.tema)}`);
        const locData = await locRes.json();
        if (!locRes.ok) throw new Error(locData.error || data.error || "Não achei dados pra reformatar esse vídeo");

        setReformatando((prev) => ({ ...prev, [id]: { status: "enviando" } }));
        res = await fetch("/api/reformatar-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colecao: "fila", itemId: locData.itemId, novoFormato: "short", ambiente: "production" }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao reformatar");
      }

      setReformatando((prev) => ({
        ...prev,
        [id]: { status: "processando", renderId: data.renderId },
      }));
    } catch (e) {
      setReformatando((prev) => ({ ...prev, [id]: { status: "erro", erro: e.message } }));
    }
  }

  async function verificarStatusReformatacao(id) {
    const info = reformatando[id];
    if (!info?.renderId) return;
    try {
      const res = await fetch(`/api/assemble-video?id=${info.renderId}&ambiente=production`);
      const data = await res.json();
      if (data.status === "done") {
        setReformatando((prev) => ({ ...prev, [id]: { ...prev[id], status: "pronto", videoUrl: data.videoUrl } }));
      } else if (data.status === "failed") {
        setReformatando((prev) => ({
          ...prev,
          [id]: { ...prev[id], status: "erro", erro: data.erro || "Falha na montagem" },
        }));
      } else {
        setReformatando((prev) => ({ ...prev, [id]: { ...prev[id], status: "processando" } }));
      }
    } catch (e) {
      setReformatando((prev) => ({ ...prev, [id]: { ...prev[id], status: "erro", erro: e.message } }));
    }
  }

  return (
    <div className="container">
      <h1>Meus Projetos</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← voltar pro painel</a>
      </p>

      {erro && <div className="card">Erro: {erro}</div>}
      {!projetos && !erro && <div className="card">Carregando...</div>}

      <div className="card">
        <h2>Trazer projeto de fora</h2>
        <p style={{ fontSize: 13, color: '#aaa' }}>
          Sobe um vídeo já pronto (feito fora do Youvideo) pra ele aparecer aqui embaixo com os mesmos botões de publicar.
        </p>
        <label>Título</label>
        <input type="text" value={tituloExterno} onChange={(e) => setTituloExterno(e.target.value)} placeholder="Ex: Vídeo feito no CapCut" />
        <label>Arquivo de vídeo</label>
        <input type="file" accept="video/*" onChange={(e) => setArquivoExterno(e.target.files?.[0] || null)} />
        <button disabled={enviandoExterno} onClick={adicionarProjetoExterno} style={{ marginTop: 10 }}>
          {enviandoExterno && <span className="spinner" />}
          {enviandoExterno ? 'Enviando...' : 'Adicionar aos meus projetos'}
        </button>
        {erroExterno && <div className="result-box">Erro: {erroExterno}</div>}
      </div>

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
                <button
                  disabled={!arquivosProntos[p.id]}
                  onClick={() =>
                    compartilhar(arquivosProntos[p.id], p.titulo, (s) => setStatusEnvio((prev) => ({ ...prev, [p.id]: s })))
                  }
                  style={{ marginTop: 0 }}
                >
                  {arquivosProntos[p.id] ? 'Enviar (TikTok / Kwai / etc)' : 'Preparando...'}
                </button>
                {statusEnvio[p.id] === 'sem-suporte' && (
                  <div style={{ fontSize: 11, color: '#ff9d9d', marginTop: 4 }}>
                    Esse navegador não suporta compartilhar vídeo direto — usa o botão "Baixar vídeo" abaixo.
                  </div>
                )}
                {statusEnvio[p.id]?.startsWith('erro:') && (
                  <div style={{ fontSize: 11, color: '#ff9d9d', marginTop: 4 }}>{statusEnvio[p.id].slice(5)}</div>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <a href={`/api/download-video?url=${encodeURIComponent(p.videoUrl)}`} target="_blank" rel="noreferrer">
                  <button style={{ marginTop: 0 }}>Baixar vídeo</button>
                </a>
              </div>
              <div style={{ marginTop: 8 }}>
                <a href={p.videoUrl} target="_blank" rel="noreferrer" style={{ color: '#4f7cff', fontSize: 13 }}>
                  Ou abrir o vídeo direto (tela cheia)
                </a>
              </div>

              <PublicarSocialBotao midiaUrl={p.videoUrl} legenda={p.titulo} />
              <PublicarTiktokBotao videoUrl={p.videoUrl} titulo={p.titulo} descricao={p.descricao} />
              {p.narracaoTexto && <VerTextoLegenda texto={p.narracaoTexto} />}

              <div style={{ marginTop: 12, borderTop: '1px solid #333', paddingTop: 10 }}>
                {!reformatando[p.id] && (
                  <button onClick={() => reformatarParaVertical(p)} style={{ marginTop: 0 }}>
                    Reformatar pra vertical (TikTok/Kwai)
                  </button>
                )}
                {reformatando[p.id]?.status === "localizando" && (
                  <div style={{ fontSize: 12, color: '#999' }}>Localizando dados originais...</div>
                )}
                {reformatando[p.id]?.status === "enviando" && (
                  <div style={{ fontSize: 12, color: '#999' }}>Enviando pedido de remontagem...</div>
                )}
                {reformatando[p.id]?.status === "processando" && (
                  <button onClick={() => verificarStatusReformatacao(p.id)} style={{ marginTop: 0 }}>
                    Ainda montando — clique pra verificar de novo
                  </button>
                )}
                {reformatando[p.id]?.status === "erro" && (
                  <div style={{ fontSize: 12, color: '#ff9d9d' }}>Erro: {reformatando[p.id].erro}</div>
                )}
                {reformatando[p.id]?.status === "pronto" && (
                  <>
                    <video
                      src={reformatando[p.id].videoUrl}
                      controls
                      playsInline
                      style={{ width: '100%', maxWidth: 220, borderRadius: 6, marginBottom: 8 }}
                    />
                    <div>
                      <a
                        href={`/api/download-video?url=${encodeURIComponent(reformatando[p.id].videoUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <button style={{ marginTop: 0 }}>Baixar versão vertical</button>
                      </a>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ))}
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
    <div style={{ marginTop: 10 }}>
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

function PublicarTiktokBotao({ videoUrl, titulo, descricao }) {
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function publicar() {
    setPublicando(true);
    setResultado(null);
    try {
      const res = await fetch('/api/tiktok-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, titulo, descricao }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao publicar no TikTok');
      setResultado({ ok: true });
    } catch (err) {
      setResultado({ erro: err.message });
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button disabled={publicando} onClick={publicar} style={{ marginTop: 0 }}>
        {publicando && <span className="spinner" />}
        {publicando ? 'Publicando...' : 'Publicar no TikTok'}
      </button>
      {resultado?.erro && <div style={{ fontSize: 12, marginTop: 6, color: '#ff9d9d' }}>TikTok: {resultado.erro}</div>}
      {resultado?.ok && <div style={{ fontSize: 12, marginTop: 6, color: '#8fd6c1' }}>TikTok: publicado ✓</div>}
    </div>
  );
}

function VerTextoLegenda({ texto }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setMostrar((v) => !v)} style={{ marginTop: 0 }}>
        {mostrar ? 'Esconder texto' : 'Ver texto (pra colar como legenda no YouTube)'}
      </button>
      {mostrar && (
        <textarea readOnly value={texto} style={{ minHeight: 160, marginTop: 8, fontSize: 12 }} />
      )}
    </div>
  );
}
