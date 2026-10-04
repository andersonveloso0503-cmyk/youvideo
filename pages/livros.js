// Livros bíblicos — você escolhe a história, a IA escreve e ilustra, e sai em PDF + Word editável (para PLR).
import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { HISTORIAS, ESTILOS, partes } from '../lib/livros';
import { gerarPdf, gerarDocx, baixarBlob, nomeArquivo } from '../lib/livroArquivos';

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let d = {};
  try { d = await r.json(); } catch { /* sem json */ }
  if (!r.ok || d.erro || d.error) throw new Error(d.erro || d.error || `Erro ${r.status}`);
  return d;
}

const ESTILOS_DO_TIPO = { infantil: ['aquarela', 'desenho'], adulto: ['pintura', 'realista', 'aquarela'] };

export default function Livros() {
  const [tipo, setTipo] = useState('infantil');
  const [historia, setHistoria] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [paginas, setPaginas] = useState(12);
  const [estilo, setEstilo] = useState('aquarela');
  const [autor, setAutor] = useState('');
  const [livro, setLivro] = useState(null);
  const [salvos, setSalvos] = useState([]);
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState('');
  const [gerandoImg, setGerandoImg] = useState({}); // chave -> true
  const livroRef = useRef(null);
  livroRef.current = livro;

  useEffect(() => {
    try { setAutor(localStorage.getItem('livros-autor') || ''); } catch { /* sem armazenamento */ }
    api('/api/livros').then((d) => setSalvos(d.livros || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!ESTILOS_DO_TIPO[tipo].includes(estilo)) setEstilo(ESTILOS_DO_TIPO[tipo][0]);
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = livro ? (livro.tipo === 'adulto' ? livro.capitulos : livro.paginasTexto) : [];
  const chaveLista = livro?.tipo === 'adulto' ? 'capitulos' : 'paginasTexto';
  const faltam = livro ? [livro.capa, ...lista].filter((x) => !x.url).length : 0;

  async function salvar(l) {
    try {
      const d = await api('/api/livros', { method: 'POST', body: JSON.stringify({ livro: l }) });
      if (!l.id) {
        setLivro((x) => (x ? { ...x, id: d.id } : x));
        l.id = d.id;
      }
      setSalvos((s) => [{ ...l, id: d.id, atualizadoEm: new Date().toISOString() }, ...s.filter((x) => x.id !== d.id)]);
    } catch (e) {
      setAviso(`Não consegui salvar: ${e.message}`);
    }
  }

  async function escrever() {
    setAviso('');
    if (!historia.trim()) { setAviso('Escolha uma história da lista ou escreva a sua.'); return; }
    setOcupado('A IA está escrevendo o livro… (até 1 minuto)');
    try {
      const d = await api('/api/livros/escrever', { method: 'POST', body: JSON.stringify({ tipo, historia, paginas, detalhes }) });
      const novo = { ...d.livro, estilo };
      setLivro(novo);
      await salvar(novo);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setAviso(e.message);
    } finally {
      setOcupado('');
    }
  }

  // Gera a ilustração de uma página (i = -1 é a capa) e guarda no livro
  async function ilustrar(i) {
    const l = livroRef.current;
    if (!l) return;
    const alvo = i < 0 ? l.capa : l[chaveLista][i];
    const chave = String(i);
    setGerandoImg((g) => ({ ...g, [chave]: true }));
    try {
      const d = await api('/api/livros/imagem', { method: 'POST', body: JSON.stringify({ cena: alvo.cena, estilo: l.estilo, tipo: l.tipo, personagem: l.personagem || '', capa: i < 0 }) });
      const atual = livroRef.current;
      const novo = i < 0
        ? { ...atual, capa: { ...atual.capa, url: d.url } }
        : { ...atual, [chaveLista]: atual[chaveLista].map((x, k) => (k === i ? { ...x, url: d.url } : x)) };
      livroRef.current = novo;
      setLivro(novo);
      return true;
    } catch (e) {
      setAviso(`${i < 0 ? 'Capa' : `Página ${i + 1}`}: ${e.message}`);
      return false;
    } finally {
      setGerandoImg((g) => { const n = { ...g }; delete n[chave]; return n; });
    }
  }

  async function ilustrarTudo() {
    setAviso('');
    const l = livroRef.current;
    const fila = [-1, ...l[chaveLista].map((_, k) => k)].filter((i) => !(i < 0 ? l.capa.url : l[chaveLista][i].url));
    if (!fila.length) return;
    let feitas = 0;
    setOcupado(`Criando as ilustrações… 0 de ${fila.length}`);
    const trabalhador = async () => {
      while (fila.length) {
        const i = fila.shift();
        await ilustrar(i);
        feitas += 1;
        setOcupado(`Criando as ilustrações… ${feitas} de ${feitas + fila.length}`);
      }
    };
    await Promise.all([trabalhador(), trabalhador()]);
    setOcupado('');
    await salvar(livroRef.current);
  }

  function editar(campo, valor, i = null) {
    setLivro((l) => {
      if (i === null) return { ...l, [campo]: valor };
      return { ...l, [chaveLista]: l[chaveLista].map((x, k) => (k === i ? { ...x, [campo]: valor } : x)) };
    });
  }

  async function baixar(formato) {
    setAviso('');
    try { localStorage.setItem('livros-autor', autor); } catch { /* ok */ }
    try {
      await salvar(livro);
      const fn = formato === 'pdf' ? gerarPdf : gerarDocx;
      const blob = await fn(livro, { autor, onEtapa: (t) => setOcupado(`${formato === 'pdf' ? 'PDF' : 'Word'}: ${t}`) });
      baixarBlob(blob, nomeArquivo(livro.titulo, formato === 'pdf' ? 'pdf' : 'docx'));
    } catch (e) {
      setAviso(`Não consegui montar o arquivo: ${e.message}`);
    } finally {
      setOcupado('');
    }
  }

  async function excluir(l) {
    if (!window.confirm(`Excluir o livro "${l.titulo}"?`)) return;
    setSalvos((s) => s.filter((x) => x.id !== l.id));
    if (livro?.id === l.id) setLivro(null);
    try { await api(`/api/livros?id=${l.id}`, { method: 'DELETE' }); } catch (e) { setAviso(e.message); }
  }

  const nImagens = partes(tipo, paginas) + 1;

  return (
    <div className="container">
      <Head><title>Livros bíblicos · Youvideo</title></Head>
      <h1>📚 Livros bíblicos</h1>
      <p className="subtitle"><a href="/" style={{ color: '#4f7cff' }}>← voltar pro painel</a> · Você escolhe a história; a IA escreve com palavras próprias, ilustra e entrega em PDF e Word editável.</p>

      {aviso && <div className="card" style={{ borderColor: '#b1432f', color: '#ffb3a6' }}>{aviso}</div>}
      {ocupado && <div className="card"><span className="spinner" /> {ocupado}</div>}

      {!livro && (
        <>
          <div className="card">
            <h2>1. Que tipo de livro?</h2>
            <div className="lv-opcoes">
              <button className={tipo === 'infantil' ? 'on' : ''} onClick={() => setTipo('infantil')}>🧒 Infantil ilustrado<small>Uma ilustração grande por página e pouco texto</small></button>
              <button className={tipo === 'adulto' ? 'on' : ''} onClick={() => setTipo('adulto')}>🙏 Devocional para adultos<small>História com reflexão, aplicação e oração</small></button>
            </div>

            <h2 style={{ marginTop: 18 }}>2. Qual história?</h2>
            <div className="lv-historias">
              {HISTORIAS.map((h) => <button key={h} className={historia === h ? 'on' : ''} onClick={() => setHistoria(h)}>{h}</button>)}
            </div>
            <label>Ou escreva a história que você quer</label>
            <input type="text" value={historia} onChange={(e) => setHistoria(e.target.value)} placeholder="Ex.: Gideão e os 300 homens" />
            <label>O que você quer destacar (opcional)</label>
            <input type="text" value={detalhes} onChange={(e) => setDetalhes(e.target.value)} placeholder="Ex.: coragem, confiar em Deus mesmo com medo" />

            <h2 style={{ marginTop: 18 }}>3. Tamanho e ilustração</h2>
            <label>Páginas</label>
            <select value={paginas} onChange={(e) => setPaginas(Number(e.target.value))}>
              <option value={12}>12 páginas</option>
              <option value={16}>16 páginas</option>
            </select>
            <label>Estilo das ilustrações</label>
            <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
              {ESTILOS_DO_TIPO[tipo].map((id) => <option key={id} value={id}>{ESTILOS[id].nome}</option>)}
            </select>
            <button disabled={!!ocupado} onClick={escrever} style={{ marginTop: 14 }}>✍️ Escrever o livro</button>
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Escrever é rápido e quase sem custo. As {nImagens} ilustrações só são criadas depois que você revisar o texto (cerca de US$ {(nImagens * 0.05).toFixed(2)}).</p>
          </div>

          {salvos.length > 0 && (
            <div className="card">
              <h2>Meus livros</h2>
              {salvos.map((l) => (
                <div key={l.id} className="lv-salvo">
                  <button className="lv-abrir" onClick={() => { setLivro(l); setAviso(''); }}>
                    <b>{l.titulo}</b>
                    <small>{l.tipo === 'adulto' ? 'Devocional' : 'Infantil'} · {l.paginas} páginas · {new Date(l.atualizadoEm || l.criadoEm).toLocaleDateString('pt-BR')}</small>
                  </button>
                  <button className="lv-x" title="Excluir" onClick={() => excluir(l)}>🗑</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {livro && (
        <>
          <div className="card">
            <button className="lv-link" onClick={() => { salvar(livro); setLivro(null); }}>← Outro livro</button>
            <label>Título</label>
            <input type="text" value={livro.titulo} onChange={(e) => editar('titulo', e.target.value)} />
            <label>Subtítulo</label>
            <input type="text" value={livro.subtitulo || ''} onChange={(e) => editar('subtitulo', e.target.value)} />
            <label>Nome do autor na capa (opcional)</label>
            <input type="text" value={autor} onChange={(e) => setAutor(e.target.value)} placeholder="Ex.: Coleção Histórias da Bíblia" />
            <label>Estilo das ilustrações</label>
            <select value={livro.estilo} onChange={(e) => editar('estilo', e.target.value)}>
              {ESTILOS_DO_TIPO[livro.tipo === 'adulto' ? 'adulto' : 'infantil'].map((id) => <option key={id} value={id}>{ESTILOS[id].nome}</option>)}
            </select>
            <div className="lv-acoes">
              {faltam > 0
                ? <button disabled={!!ocupado} onClick={ilustrarTudo}>🎨 Criar as {faltam} ilustrações que faltam</button>
                : <span style={{ color: '#8fd6c1' }}>✅ Todas as ilustrações prontas</span>}
              <button disabled={!!ocupado} onClick={() => baixar('pdf')}>⬇ Baixar PDF</button>
              <button disabled={!!ocupado} onClick={() => baixar('docx')}>⬇ Baixar Word (editável)</button>
              <button className="lv-sec" disabled={!!ocupado} onClick={() => salvar(livro).then(() => setAviso('Livro salvo.'))}>💾 Salvar</button>
            </div>
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Revise o texto abaixo antes de criar as ilustrações: dá para mudar qualquer página. Página sem ilustração sai só com o texto.</p>
          </div>

          <Pagina titulo="Capa" item={livro.capa} gerando={gerandoImg['-1']} capa ocupado={!!ocupado}
            onCena={(v) => setLivro((l) => ({ ...l, capa: { ...l.capa, cena: v } }))} onGerar={() => ilustrar(-1).then((ok) => ok && salvar(livroRef.current))} />

          {livro.tipo === 'adulto' && (
            <div className="card">
              <h2>Introdução</h2>
              <textarea rows={6} value={livro.introducao || ''} onChange={(e) => editar('introducao', e.target.value)} />
            </div>
          )}

          {lista.map((p, i) => (
            <Pagina key={i} titulo={livro.tipo === 'adulto' ? `Capítulo ${i + 1}` : `Página ${i + 1}`} item={p} gerando={gerandoImg[String(i)]} ocupado={!!ocupado}
              adulto={livro.tipo === 'adulto'} onCampo={(campo, v) => editar(campo, v, i)} onCena={(v) => editar('cena', v, i)} onGerar={() => ilustrar(i).then((ok) => ok && salvar(livroRef.current))} />
          ))}

          <div className="card">
            {livro.tipo === 'adulto' ? (
              <>
                <h2>Conclusão</h2>
                <textarea rows={6} value={livro.conclusao || ''} onChange={(e) => editar('conclusao', e.target.value)} />
                <label>Oração final</label>
                <textarea rows={4} value={livro.oracaoFinal || ''} onChange={(e) => editar('oracaoFinal', e.target.value)} />
              </>
            ) : (
              <>
                <h2>Páginas finais</h2>
                <label>O que aprendemos</label>
                <textarea rows={3} value={livro.licao || ''} onChange={(e) => editar('licao', e.target.value)} />
                <label>Oração</label>
                <textarea rows={2} value={livro.oracao || ''} onChange={(e) => editar('oracao', e.target.value)} />
                <label>Perguntas para conversar (uma por linha)</label>
                <textarea rows={4} value={(livro.perguntas || []).join('\n')} onChange={(e) => editar('perguntas', e.target.value.split('\n'))} />
              </>
            )}
          </div>
        </>
      )}

      <style jsx global>{`
        .lv-opcoes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .lv-opcoes button { text-align: left; background: transparent; border: 1px solid #444; color: inherit; margin-top: 0; }
        .lv-opcoes button small { display: block; font-weight: 400; opacity: 0.7; margin-top: 4px; }
        .lv-opcoes button.on, .lv-historias button.on { border-color: #d8a441; background: rgba(216, 164, 65, 0.14); color: #f1dfb6; }
        .lv-historias { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .lv-historias button { width: auto; margin-top: 0; padding: 7px 12px; font-size: 13px; border-radius: 999px; background: transparent; border: 1px solid #444; color: inherit; font-weight: 500; }
        .lv-acoes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; }
        .lv-acoes button { width: auto; margin-top: 0; }
        .lv-sec, .lv-link { background: transparent !important; border: 1px solid #444 !important; color: inherit !important; }
        .lv-link { width: auto; margin: 0 0 6px; padding: 6px 12px; font-size: 13px; }
        .lv-salvo { display: flex; gap: 8px; margin-top: 8px; }
        .lv-abrir { flex: 1; text-align: left; margin-top: 0; background: transparent; border: 1px solid #444; color: inherit; }
        .lv-abrir small { display: block; font-weight: 400; opacity: 0.7; margin-top: 3px; }
        .lv-x { width: auto; margin-top: 0; background: transparent; border: 1px solid #444; }
        .lv-pagina { display: grid; grid-template-columns: 220px 1fr; gap: 14px; align-items: start; }
        .lv-pagina img, .lv-vazia { width: 100%; border-radius: 8px; background: #2a241c; }
        .lv-vazia { aspect-ratio: 4 / 3; display: grid; place-items: center; color: #777; font-size: 13px; text-align: center; padding: 8px; }
        .lv-vazia.capa { aspect-ratio: 7 / 10; }
        .lv-pagina button { width: auto; margin-top: 6px; padding: 6px 10px; font-size: 13px; }
        @media (max-width: 640px) { .lv-pagina { grid-template-columns: 1fr; } .lv-opcoes { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function Pagina({ titulo, item, gerando, capa, adulto, ocupado, onCampo, onCena, onGerar }) {
  return (
    <div className="card">
      <h2>{titulo}</h2>
      <div className="lv-pagina">
        <div>
          {item.url ? <img src={item.url} alt={titulo} /> : <div className={`lv-vazia ${capa ? 'capa' : ''}`}>{gerando ? 'Criando…' : 'Sem ilustração ainda'}</div>}
          <button disabled={gerando || ocupado} onClick={onGerar}>{gerando ? 'Criando…' : item.url ? '🔁 Outra ilustração' : '🎨 Criar ilustração'}</button>
        </div>
        <div>
          {!capa && adulto && (
            <>
              <label style={{ marginTop: 0 }}>Título do capítulo</label>
              <input type="text" value={item.titulo || ''} onChange={(e) => onCampo('titulo', e.target.value)} />
            </>
          )}
          {!capa && (
            <>
              <label style={adulto ? undefined : { marginTop: 0 }}>Texto</label>
              <textarea rows={adulto ? 9 : 4} value={item.texto || ''} onChange={(e) => onCampo('texto', e.target.value)} />
            </>
          )}
          {!capa && adulto && (
            <>
              <label>Para a sua vida</label>
              <textarea rows={2} value={item.aplicacao || ''} onChange={(e) => onCampo('aplicacao', e.target.value)} />
              <label>Oração</label>
              <textarea rows={2} value={item.oracao || ''} onChange={(e) => onCampo('oracao', e.target.value)} />
            </>
          )}
          <label style={capa ? { marginTop: 0 } : undefined}>O que aparece na ilustração</label>
          <textarea rows={2} value={item.cena || ''} onChange={(e) => onCena(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
