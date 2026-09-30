// Página para postar no Kwai e no TikTok pelo CELULAR: mostra os vídeos agendados para essas
// redes, com botão para mandar direto para o app (compartilhar), baixar e copiar a legenda.
// Abra no celular: https://youvideors2.vercel.app/postar  (o endereço /kwai também funciona)
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';

const REDES = [
  ['tiktok', 'TikTok', '#25f4ee'],
  ['kwai', 'Kwai', '#ff7a00'],
];
const faltando = (a) => REDES.filter(([r]) => a.redes?.[r] && a.redes[r].status !== 'ok');

export default function Postar() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState({});
  const [prontos, setProntos] = useState({}); // vídeo já baixado no celular, pronto para compartilhar

  useEffect(() => {
    try {
      const t = localStorage.getItem(CHAVE);
      if (t) setToken(t);
    } catch {}
  }, []);

  async function carregar(t = token) {
    if (!t) return;
    setErro('');
    try {
      const r = await fetch('/api/central/agenda', { headers: { 'x-central-token': t } });
      const d = await r.json();
      if (r.status === 401) {
        try { localStorage.removeItem(CHAVE); } catch {}
        setToken('');
        throw new Error('Senha incorreta. Digite de novo.');
      }
      if (!r.ok) throw new Error(d.erro || 'Erro ao carregar');
      setItens((d.itens || []).filter((a) => faltando(a).length));
    } catch (e) {
      setErro(e.message);
    }
  }
  useEffect(() => { carregar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const entrar = () => {
    const t = digitado.trim();
    if (!t) return;
    try { localStorage.setItem(CHAVE, t); } catch {}
    setToken(t);
  };

  const aviso = (id, texto) => setMsg((m) => ({ ...m, [id]: texto }));

  // 1º toque: baixa o vídeo para o celular. 2º toque: abre a lista de apps (TikTok, Kwai...).
  // (O celular só deixa abrir o compartilhar logo depois de um toque, por isso são dois passos.)
  async function preparar(a) {
    try {
      aviso(a.id, 'Baixando o vídeo para o celular...');
      const r = await fetch(`/api/download-video?url=${encodeURIComponent(a.videoUrl)}`);
      if (!r.ok) throw new Error('não consegui baixar o vídeo');
      const blob = await r.blob();
      const arquivo = new File([blob], `${(a.titulo || 'video').replace(/[^\w\- ]/g, '').slice(0, 40) || 'video'}.mp4`, { type: 'video/mp4' });
      setProntos((p) => ({ ...p, [a.id]: arquivo }));
      aviso(a.id, 'Pronto! Agora toque em "Enviar".');
    } catch (e) {
      aviso(a.id, `Não deu: ${e.message}`);
    }
  }

  async function compartilhar(a) {
    const arquivo = prontos[a.id];
    const legenda = a.legendaCelular || a.legenda || a.titulo;
    try {
      try { await navigator.clipboard.writeText(legenda); } catch {}
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], text: legenda, title: a.titulo });
        aviso(a.id, 'Escolha o TikTok ou o Kwai. A legenda já está copiada: é só colar. Depois toque em "Já postei".');
      } else {
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = arquivo.name;
        link.click();
        aviso(a.id, 'Este navegador não compartilha vídeo direto: o vídeo foi salvo. Abra o TikTok ou o Kwai e escolha da galeria. A legenda já está copiada.');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      aviso(a.id, `Não deu: ${e.message}`);
    }
  }

  async function copiar(a) {
    try {
      await navigator.clipboard.writeText(a.legendaCelular || a.legenda || a.titulo);
      aviso(a.id, 'Legenda copiada');
    } catch {
      aviso(a.id, 'Não consegui copiar. Segure no texto da legenda para copiar.');
    }
  }

  async function feito(a, rede) {
    await fetch('/api/central/agenda', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-central-token': token },
      body: JSON.stringify({ id: a.id, rede, acao: 'feito' }),
    });
    setItens((l) =>
      l
        .map((x) => (x.id === a.id ? { ...x, redes: { ...x.redes, [rede]: { status: 'ok' } } } : x))
        .filter((x) => faltando(x).length)
    );
  }

  const agora = new Date().toISOString();
  const diaBr = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  const hoje = diaBr(new Date().toISOString());
  const atrasados = (itens || []).filter((a) => a.quando <= agora && diaBr(a.quando) < hoje);
  const deHoje = (itens || []).filter((a) => diaBr(a.quando) === hoje);
  const depois = (itens || []).filter((a) => diaBr(a.quando) > hoje);
  const horaTxt = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const Cartao = ({ a, cedo }) => (
    <div className="cartao">
      <video src={a.videoUrl} poster={a.thumbnailUrl || undefined} controls playsInline preload="metadata" />
      <div className="info">
        <b>{a.titulo}</b>
        <small>{cedo ? `Agendado para ${quando(a.quando)}` : `Era para ${quando(a.quando)}`}</small>
        <div className="redes">{faltando(a).map(([r, nome, cor]) => <span key={r} style={{ borderColor: cor, color: cor }}>{nome}</span>)}</div>
        <p className="legenda">{a.legendaCelular || a.legenda || a.titulo}</p>
        {prontos[a.id] ? (
          <button className="principal" onClick={() => compartilhar(a)}>📤 Enviar para {faltando(a).map(([, n]) => n).join(' / ')}</button>
        ) : (
          <button className="principal" onClick={() => preparar(a)}>⬇ Preparar vídeo para postar</button>
        )}
        <div className="linha">
          <button onClick={() => copiar(a)}>📋 Copiar legenda</button>
          <a href={`/api/download-video?url=${encodeURIComponent(a.videoUrl)}`}><button>⬇ Baixar</button></a>
        </div>
        {faltando(a).map(([r, nome]) => (
          <button key={r} className="feito" onClick={() => feito(a, r)}>✓ Já postei no {nome}</button>
        ))}
        {msg[a.id] && <p className="msg">{msg[a.id]}</p>}
      </div>
    </div>
  );

  return (
    <div className="pagina">
      <Head>
        <title>Postar pelo celular · Youvideo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <h1>📱 Postar no TikTok e no Kwai</h1>
      <p className="topo-links"><a href="/">← Youvideo</a> · <a href="/projetos">Meus projetos</a></p>
      {!token ? (
        <div className="entrar">
          <p>Digite a senha da Central (a mesma do Youvideo Compilador). Fica guardada neste celular.</p>
          <input value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="Senha da Central" autoComplete="off" />
          <button className="principal" onClick={entrar}>Entrar</button>
          {erro && <p className="erro">{erro}</p>}
        </div>
      ) : (
        <>
          <button className="atualizar" onClick={() => carregar()}>↻ Atualizar</button>
          {erro && <p className="erro">{erro}</p>}
          {itens === null && !erro && <p>Carregando...</p>}
          {itens && !itens.length && <p>Nada para postar agora. 🎉</p>}
          {deHoje.length > 0 && (
            <div className="hoje">
              <b>📅 Hoje você posta {deHoje.length === 1 ? 'este' : `estes ${deHoje.length}`}:</b>
              {deHoje.map((a) => (
                <div key={a.id}>{a.quando <= agora ? '🔔' : '🕒'} {horaTxt(a.quando)} — {a.titulo}</div>
              ))}
            </div>
          )}
          {atrasados.length > 0 && <h2>Ficaram para trás ({atrasados.length})</h2>}
          {atrasados.map((a) => <Cartao key={a.id} a={a} />)}
          {deHoje.length > 0 && <h2>Hoje ({deHoje.length})</h2>}
          {deHoje.map((a) => <Cartao key={a.id} a={a} cedo={a.quando > agora} />)}
          {depois.length > 0 && <h2>Próximos dias</h2>}
          {depois.map((a) => <Cartao key={a.id} a={a} cedo />)}
        </>
      )}
      <style jsx global>{`
        body { margin: 0; background: #15130f; color: #f3ead9; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
        .pagina { max-width: 520px; margin: 0 auto; padding: 16px; }
        h1 { font-size: 22px; margin: 6px 0 14px; }
        h2 { font-size: 15px; color: #d9a441; margin: 18px 0 8px; }
        .cartao { background: #211d17; border: 1px solid #3a3228; border-radius: 14px; overflow: hidden; margin-bottom: 14px; }
        .cartao video { width: 100%; max-height: 60vh; background: #000; display: block; }
        .info { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .info small { color: #9c9080; }
        .legenda { background: #15130f; border-radius: 8px; padding: 8px; margin: 0; font-size: 13px; white-space: pre-wrap; user-select: all; }
        button { font: inherit; border-radius: 10px; border: 1px solid #3a3228; background: #2b261f; color: #f3ead9; padding: 12px; width: 100%; font-weight: 600; }
        .principal { background: #ff3b5c; border-color: #ff3b5c; color: #fff; font-size: 16px; }
        .redes { display: flex; gap: 6px; }
        .redes span { border: 1px solid; border-radius: 20px; padding: 2px 10px; font-size: 12px; font-weight: 700; }
        .feito { background: #1f3325; border-color: #2f5a3a; color: #9fdcae; }
        .linha { display: flex; gap: 8px; }
        .linha > * { flex: 1; }
        .linha a { text-decoration: none; }
        .atualizar { width: auto; padding: 8px 14px; margin-bottom: 6px; }
        .entrar { display: flex; flex-direction: column; gap: 10px; }
        .entrar input { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #3a3228; background: #211d17; color: #f3ead9; }
        .erro { color: #ff8a7a; }
        .msg { color: #d9a441; font-size: 13px; margin: 0; }
        .hoje { background: #2a1a22; border: 1px solid #ff3b5c; border-radius: 12px; padding: 12px; margin: 6px 0 4px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
        .topo-links { margin: -8px 0 12px; font-size: 13px; }
        .topo-links a { color: #d9a441; }
      `}</style>
    </div>
  );
}
