// Página para postar no Kwai pelo CELULAR: mostra os vídeos agendados para o Kwai,
// com botão para mandar direto para o app do Kwai (compartilhar), baixar e copiar a legenda.
// Abra no celular: https://youvideors2.vercel.app/kwai
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';

export default function Kwai() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState({});

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
      setItens((d.itens || []).filter((a) => a.redes?.kwai && a.redes.kwai.status !== 'ok'));
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

  async function compartilhar(a) {
    const legenda = a.legenda || a.titulo;
    try {
      aviso(a.id, 'Preparando o vídeo...');
      const r = await fetch(`/api/download-video?url=${encodeURIComponent(a.videoUrl)}`);
      if (!r.ok) throw new Error('não consegui baixar o vídeo');
      const blob = await r.blob();
      const arquivo = new File([blob], `${(a.titulo || 'video').replace(/[^\w\- ]/g, '').slice(0, 40) || 'video'}.mp4`, { type: 'video/mp4' });
      try { await navigator.clipboard.writeText(legenda); } catch {}
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], text: legenda, title: a.titulo });
        aviso(a.id, 'Escolha o Kwai na lista. A legenda já está copiada: é só colar. Depois toque em "Já postei".');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = arquivo.name;
        link.click();
        aviso(a.id, 'Este navegador não compartilha vídeo direto: o vídeo foi baixado. Abra o Kwai e escolha da galeria. A legenda já está copiada.');
      }
    } catch (e) {
      if (e.name === 'AbortError') return aviso(a.id, '');
      aviso(a.id, `Não deu: ${e.message}`);
    }
  }

  async function copiar(a) {
    try {
      await navigator.clipboard.writeText(a.legenda || a.titulo);
      aviso(a.id, 'Legenda copiada');
    } catch {
      aviso(a.id, 'Não consegui copiar. Segure no texto da legenda para copiar.');
    }
  }

  async function feito(a) {
    await fetch('/api/central/agenda', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-central-token': token },
      body: JSON.stringify({ id: a.id, rede: 'kwai', acao: 'feito' }),
    });
    setItens((l) => l.filter((x) => x.id !== a.id));
  }

  const agora = new Date().toISOString();
  const naHora = (itens || []).filter((a) => a.quando <= agora);
  const depois = (itens || []).filter((a) => a.quando > agora);
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const Cartao = ({ a, cedo }) => (
    <div className="cartao">
      <video src={a.videoUrl} poster={a.thumbnailUrl || undefined} controls playsInline preload="metadata" />
      <div className="info">
        <b>{a.titulo}</b>
        <small>{cedo ? `Agendado para ${quando(a.quando)}` : `Era para ${quando(a.quando)}`}</small>
        <p className="legenda">{a.legenda || a.titulo}</p>
        <button className="principal" onClick={() => compartilhar(a)}>📤 Enviar para o Kwai</button>
        <div className="linha">
          <button onClick={() => copiar(a)}>📋 Copiar legenda</button>
          <a href={`/api/download-video?url=${encodeURIComponent(a.videoUrl)}`}><button>⬇ Baixar</button></a>
        </div>
        <button className="feito" onClick={() => feito(a)}>✓ Já postei</button>
        {msg[a.id] && <p className="msg">{msg[a.id]}</p>}
      </div>
    </div>
  );

  return (
    <div className="pagina">
      <Head>
        <title>Kwai · Youvideo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <h1>📱 Postar no Kwai</h1>
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
          {itens && !itens.length && <p>Nada para postar no Kwai agora. 🎉</p>}
          {naHora.length > 0 && <h2>Para postar agora ({naHora.length})</h2>}
          {naHora.map((a) => <Cartao key={a.id} a={a} />)}
          {depois.length > 0 && <h2>Próximos</h2>}
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
        .principal { background: #ff7a00; border-color: #ff7a00; color: #fff; font-size: 16px; }
        .feito { background: #1f3325; border-color: #2f5a3a; color: #9fdcae; }
        .linha { display: flex; gap: 8px; }
        .linha > * { flex: 1; }
        .linha a { text-decoration: none; }
        .atualizar { width: auto; padding: 8px 14px; margin-bottom: 6px; }
        .entrar { display: flex; flex-direction: column; gap: 10px; }
        .entrar input { font: inherit; padding: 12px; border-radius: 10px; border: 1px solid #3a3228; background: #211d17; color: #f3ead9; }
        .erro { color: #ff8a7a; }
        .msg { color: #d9a441; font-size: 13px; margin: 0; }
      `}</style>
    </div>
  );
}
