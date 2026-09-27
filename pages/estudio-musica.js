import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';

// ───────────────────────── Estilos prontos (chips) ─────────────────────────

const ESTILOS = [
  { id: 'gospel', nome: 'Gospel / Louvor', base: 'Brazilian gospel worship, modern, emotional, piano and pads, uplifting build' },
  { id: 'gospel-animado', nome: 'Gospel Animado', base: 'upbeat Brazilian gospel, festive, drums, bass, joyful, danceable' },
  { id: 'sertanejo', nome: 'Sertanejo', base: 'Brazilian sertanejo, romantic, acoustic guitar, accordion touch' },
  { id: 'gaucha', nome: 'Gaúcha / Nativista', base: 'Southern Brazilian gaucho music, milonga, nylon guitar, accordion' },
  { id: 'pagode', nome: 'Pagode / Samba', base: 'Brazilian pagode, samba, cavaquinho, pandeiro, swing' },
  { id: 'forro', nome: 'Forró / Piseiro', base: 'Brazilian forro piseiro, accordion, zabumba, danceable' },
  { id: 'mpb', nome: 'MPB / Acústico', base: 'Brazilian MPB, acoustic, bossa nova touch, intimate' },
  { id: 'pop', nome: 'Pop', base: 'modern pop, catchy hook, clean production' },
  { id: 'rock', nome: 'Rock', base: 'rock, electric guitars, powerful drums, energetic' },
  { id: 'funk', nome: 'Funk BR', base: 'Brazilian funk, heavy beat, catchy' },
  { id: 'blues', nome: 'Blues Gospel', base: 'soulful blues gospel, organ, electric guitar, emotional' },
  { id: 'lofi', nome: 'Lo-fi / Relax', base: 'lo-fi chill, soft beats, calm, relaxing' },
  { id: 'infantil', nome: 'Infantil', base: "children's song, playful, cheerful, simple melody" },
];

const VOZES = [
  { id: 'masculina', nome: 'Masculina' },
  { id: 'feminina', nome: 'Feminina' },
  { id: 'dueto', nome: 'Dueto' },
  { id: 'coral', nome: 'Com coral' },
];

const MOTORES = [
  { id: 'elevenlabs', nome: 'ElevenLabs', desc: '2 versões · oficial · ~R$3-5 cada' },
  { id: 'lyria', nome: 'Google Lyria', desc: '2 versões · oficial · ~R$0,50-1 cada' },
  { id: 'comparar', nome: 'Comparar', desc: '1 de cada motor, lado a lado' },
];

// ───────────────────────── Auxiliares ─────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let d = {};
  try { d = await r.json(); } catch { /* sem json */ }
  if (!r.ok || d.erro || d.error) throw new Error(d.erro || d.error || `Erro ${r.status}`);
  return d;
}

function fmtTempo(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function nomeMotor(m) {
  if (m === 'medley') return 'Medley';
  return m === 'lyria' ? 'Lyria' : 'ElevenLabs';
}

const MEDLEY_PADRAO = [
  { estiloId: 'gospel', tema: '' },
  { estiloId: 'sertanejo', tema: '' },
  { estiloId: 'forro', tema: '' },
  { estiloId: 'pagode', tema: '' },
];

// Roda tarefas com no máximo N ao mesmo tempo
async function emLotes(itens, n, fn) {
  const res = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; res[k] = await fn(itens[k], k); }
  }));
  return res;
}

function arquivoNome(t, ext = 'mp3') {
  return `${(t || 'musica').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'musica'}.${ext}`;
}

async function baixar(url, nome) {
  try {
    const blob = await fetch(url).then((r) => r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, '_blank');
  }
}

// ───────────────────────── Página ─────────────────────────

export default function EstudioMusica() {
  // Criação
  const [modo, setModo] = useState('simples');
  const [motor, setMotor] = useState('elevenlabs');
  const [descricao, setDescricao] = useState('');
  const [titulo, setTitulo] = useState('');
  const [letra, setLetra] = useState('');
  const [temaLetra, setTemaLetra] = useState('');
  const [estiloId, setEstiloId] = useState('gospel');
  const [estiloExtra, setEstiloExtra] = useState('');
  const [voz, setVoz] = useState('masculina');
  const [instrumental, setInstrumental] = useState(false);
  const [duracao, setDuracao] = useState(150);
  const [escrevendo, setEscrevendo] = useState(false);
  const [gerando, setGerando] = useState([]); // [{ chave, motor, inicio, erro }]
  const [aviso, setAviso] = useState('');

  // Medley
  const [medTitulo, setMedTitulo] = useState('');
  const [medTema, setMedTema] = useState('');
  const [medFaixas, setMedFaixas] = useState(MEDLEY_PADRAO);
  const [crossfade, setCrossfade] = useState(3);
  const [medProgresso, setMedProgresso] = useState(null); // { titulo, etapas: [{nome, status}], fase, erro }

  // Seleção para juntar
  const [selecionando, setSelecionando] = useState(false);
  const [selecao, setSelecao] = useState([]); // ids em ordem

  // Biblioteca
  const [musicas, setMusicas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(null); // id do card expandido
  const [trabalho, setTrabalho] = useState({}); // { [id]: 'mensagem' }

  // Player
  const audioRef = useRef(null);
  const [tocando, setTocando] = useState(null); // música
  const [pausado, setPausado] = useState(true);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [agora, setAgora] = useState(Date.now());

  const estiloTexto = useMemo(() => {
    const base = ESTILOS.find((e) => e.id === estiloId)?.base || '';
    return [base, estiloExtra.trim()].filter(Boolean).join(', ');
  }, [estiloId, estiloExtra]);

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!gerando.length) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [gerando.length]);

  async function carregar() {
    setCarregando(true);
    try {
      const d = await api('/api/estudio/biblioteca');
      setMusicas(d.musicas || []);
    } catch (e) {
      setAviso(`Não consegui carregar a biblioteca: ${e.message}`);
    } finally {
      setCarregando(false);
    }
  }

  function atualizarLocal(id, campos) {
    setMusicas((ms) => ms.map((m) => (m.id === id ? { ...m, ...campos } : m)));
    setTocando((t) => (t && t.id === id ? { ...t, ...campos } : t));
  }

  // ── Letra com IA ──
  async function escreverLetra(melhorar) {
    setAviso('');
    setEscrevendo(true);
    try {
      const d = await api('/api/estudio/letra', {
        method: 'POST',
        body: JSON.stringify({
          acao: 'letra',
          tema: temaLetra || titulo,
          estilo: ESTILOS.find((e) => e.id === estiloId)?.nome,
          voz: VOZES.find((v) => v.id === voz)?.nome,
          letraAtual: melhorar ? letra : '',
        }),
      });
      setLetra(d.letra);
      if (!titulo && d.titulo) setTitulo(d.titulo);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setEscrevendo(false);
    }
  }

  // ── Criar música ──
  async function criar(parametrosFixos) {
    setAviso('');
    const p = parametrosFixos || {
      modo,
      descricao,
      titulo,
      letra,
      estilo: estiloTexto,
      voz: instrumental ? '' : voz,
      instrumental,
      duracaoSeg: duracao,
    };
    if (p.modo === 'simples' && !p.descricao.trim()) { setAviso('Descreva a música que você quer.'); return; }
    if (p.modo === 'personalizado' && !p.instrumental && !p.letra.trim()) { setAviso('Escreva ou gere a letra primeiro (ou marque Instrumental).'); return; }

    const motorEscolhido = parametrosFixos?.motor || motor;
    const motores = motorEscolhido === 'comparar' ? ['elevenlabs', 'lyria'] : [motorEscolhido, motorEscolhido];
    const grupoId = `g${Date.now()}`;
    const jobs = motores.map((m, i) => ({ chave: `${grupoId}-${i}`, motor: m, inicio: Date.now(), titulo: p.titulo || p.descricao }));
    setGerando((g) => [...jobs, ...g]);

    await Promise.all(jobs.map(async (job, i) => {
      try {
        const d = await api('/api/estudio/gerar', {
          method: 'POST',
          body: JSON.stringify({ ...p, motor: job.motor, grupoId, versao: i + 1 }),
        });
        setMusicas((ms) => [d.musica, ...ms]);
        setGerando((g) => g.filter((x) => x.chave !== job.chave));
      } catch (e) {
        setGerando((g) => g.map((x) => (x.chave === job.chave ? { ...x, erro: e.message } : x)));
      }
    }));
  }

  function variacao(m) {
    criar({
      motor: m.motor,
      modo: m.modo,
      descricao: m.descricao || '',
      titulo: m.titulo,
      letra: m.letra || '',
      estilo: m.estilo || '',
      voz: m.voz || '',
      instrumental: !!m.instrumental,
      duracaoSeg: m.duracaoSeg || 150,
    });
  }

  function reutilizar(m) {
    setModo(m.modo === 'personalizado' ? 'personalizado' : 'simples');
    setDescricao(m.descricao || '');
    setTitulo(m.titulo || '');
    setLetra(m.letra || '');
    setInstrumental(!!m.instrumental);
    if (m.voz) setVoz(m.voz);
    if (m.duracaoSeg) setDuracao(m.duracaoSeg);
    const achado = ESTILOS.find((e) => m.estilo && m.estilo.startsWith(e.base));
    if (achado) {
      setEstiloId(achado.id);
      setEstiloExtra(m.estilo.slice(achado.base.length).replace(/^,\s*/, ''));
    } else {
      setEstiloExtra(m.estilo || '');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Medley: gera N músicas e junta ──
  async function criarMedley() {
    setAviso('');
    if (medFaixas.length < 2) { setAviso('Coloque pelo menos 2 músicas no medley.'); return; }
    if (!medTema.trim() && medFaixas.some((f) => !f.tema.trim())) {
      setAviso('Escreva o tema geral do medley (ou um tema em cada música).');
      return;
    }
    const motorMed = motor === 'comparar' ? 'elevenlabs' : motor;
    const grupoId = `m${Date.now()}`;
    const tituloMed = medTitulo.trim() || `Medley ${medFaixas.map((f) => ESTILOS.find((e) => e.id === f.estiloId)?.nome.split(' ')[0]).join(', ')}`;
    const etapas = medFaixas.map((f, i) => ({ nome: `${i + 1}. ${ESTILOS.find((e) => e.id === f.estiloId)?.nome}`, status: 'esperando' }));
    setMedProgresso({ titulo: tituloMed, etapas, fase: 'musicas', erro: '' });
    const marcar = (k, status) => setMedProgresso((p) => p && ({ ...p, etapas: p.etapas.map((e, i) => (i === k ? { ...e, status } : e)) }));

    try {
      const prontas = await emLotes(medFaixas, 2, async (f, k) => {
        const est = ESTILOS.find((e) => e.id === f.estiloId) || ESTILOS[0];
        marcar(k, 'escrevendo a letra…');
        const l = await api('/api/estudio/letra', {
          method: 'POST',
          body: JSON.stringify({ acao: 'letra', tema: f.tema.trim() || medTema, estilo: est.nome, voz: VOZES.find((v) => v.id === voz)?.nome }),
        });
        marcar(k, 'criando a música…');
        const d = await api('/api/estudio/gerar', {
          method: 'POST',
          body: JSON.stringify({
            motor: motorMed,
            modo: 'personalizado',
            titulo: l.titulo || `${tituloMed} ${k + 1}`,
            letra: l.letra,
            estilo: est.base,
            voz,
            instrumental: false,
            duracaoSeg: duracao,
            grupoId,
            versao: k + 1,
          }),
        });
        setMusicas((ms) => [d.musica, ...ms]);
        marcar(k, 'pronta ✓');
        return { ...d.musica, estiloNome: est.nome };
      });

      setMedProgresso((p) => ({ ...p, fase: 'juntando' }));
      const d = await api('/api/estudio/juntar', {
        method: 'POST',
        body: JSON.stringify({ titulo: tituloMed, faixas: prontas, crossfade }),
      });
      setMusicas((ms) => [d.musica, ...ms]);
      setMedProgresso(null);
      setAberta(d.musica.id);
      setAviso(`Medley "${tituloMed}" pronto! As músicas separadas também ficaram na biblioteca.`);
    } catch (e) {
      setMedProgresso((p) => p && ({ ...p, erro: e.message }));
    }
  }

  function alternarSelecao(id) {
    setSelecao((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function juntarSelecionadas() {
    const faixas = selecao.map((id) => musicas.find((m) => m.id === id)).filter(Boolean);
    if (faixas.length < 2) { setAviso('Selecione pelo menos 2 músicas.'); return; }
    const t = window.prompt('Título do medley:', `Medley com ${faixas.length} músicas`);
    if (t === null) return;
    setMedProgresso({ titulo: t, etapas: faixas.map((f, i) => ({ nome: `${i + 1}. ${f.titulo}`, status: 'pronta ✓' })), fase: 'juntando', erro: '' });
    try {
      const d = await api('/api/estudio/juntar', { method: 'POST', body: JSON.stringify({ titulo: t, faixas, crossfade }) });
      setMusicas((ms) => [d.musica, ...ms]);
      setMedProgresso(null);
      setSelecao([]);
      setSelecionando(false);
      setAberta(d.musica.id);
    } catch (e) {
      setMedProgresso((p) => p && ({ ...p, erro: e.message }));
    }
  }

  function mandarParaMedleyCanal(m) {
    const faixas = m.faixas || [];
    if (faixas.some((f) => !f.letra || !f.letra.trim())) {
      setAviso('O Medley do canal precisa da letra de todas as músicas, e alguma faixa está sem letra.');
      return;
    }
    if (!window.confirm(`Mandar "${m.titulo}" (${faixas.length} músicas) para o Medley do canal? Ele vira vídeo e entra na fila de publicação.`)) return;
    comTrabalho(m.id, 'Mandando para o Medley do canal…', async (msg) => {
      const c = await api('/api/medley-criar', {
        method: 'POST',
        body: JSON.stringify({ titulo: m.titulo, estilo: 'cinematografico', formato: 'longo', textoThumbnail: (m.titulo || '').toUpperCase().slice(0, 40), ambiente: 'production' }),
      });
      for (let i = 0; i < faixas.length; i++) {
        msg(`Enviando música ${i + 1} de ${faixas.length}…`);
        await api('/api/medley-adicionar-musica', { method: 'POST', body: JSON.stringify({ medleyId: c.id, audioUrl: faixas[i].audioUrl, letra: faixas[i].letra }) });
      }
      await api('/api/medley-finalizar', { method: 'POST', body: JSON.stringify({ medleyId: c.id }) });
      setAviso(`"${m.titulo}" foi para o Medley do canal. Acompanhe o vídeo na tela Medley.`);
    });
  }

  // ── Player ──
  function tocar(m) {
    const a = audioRef.current;
    if (!a) return;
    if (tocando && tocando.id === m.id) {
      if (a.paused) a.play(); else a.pause();
      return;
    }
    setTocando(m);
    a.src = m.audioUrl;
    a.play().catch(() => {});
  }

  // ── Ações da biblioteca ──
  async function favoritar(m) {
    atualizarLocal(m.id, { favorito: !m.favorito });
    try { await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, favorito: !m.favorito }) }); } catch (e) { setAviso(e.message); }
  }

  async function renomear(m) {
    const novo = window.prompt('Novo título:', m.titulo);
    if (!novo || novo === m.titulo) return;
    atualizarLocal(m.id, { titulo: novo });
    try { await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, titulo: novo }) }); } catch (e) { setAviso(e.message); }
  }

  async function excluir(m) {
    if (!window.confirm(`Excluir "${m.titulo}" da biblioteca?`)) return;
    setMusicas((ms) => ms.filter((x) => x.id !== m.id));
    if (tocando?.id === m.id) { audioRef.current?.pause(); setTocando(null); }
    try { await api(`/api/estudio/biblioteca?id=${m.id}`, { method: 'DELETE' }); } catch (e) { setAviso(e.message); }
  }

  async function comTrabalho(id, msg, fn) {
    setTrabalho((t) => ({ ...t, [id]: msg }));
    try {
      await fn((nova) => setTrabalho((t) => ({ ...t, [id]: nova })));
    } catch (e) {
      setAviso(e.message);
    } finally {
      setTrabalho((t) => { const n = { ...t }; delete n[id]; return n; });
    }
  }

  function gerarCapa(m) {
    comTrabalho(m.id, 'Criando a capa…', async () => {
      const d = await api('/api/estudio/capa', {
        method: 'POST',
        body: JSON.stringify({ id: m.id, titulo: m.titulo, estilo: m.estilo, descricao: m.descricao }),
      });
      atualizarLocal(m.id, { capaUrl: d.capaUrl });
    });
  }

  function separarStems(m) {
    comTrabalho(m.id, 'Separando voz e instrumentos…', async (msg) => {
      const job = await api('/api/cover/fal', { method: 'POST', body: JSON.stringify({ tipo: 'separar', audioUrl: m.audioUrl }) });
      const fim = Date.now() + 15 * 60 * 1000;
      let resultado = null;
      while (Date.now() < fim) {
        const q = new URLSearchParams({ statusUrl: job.statusUrl, responseUrl: job.responseUrl });
        const d = await api(`/api/cover/fal?${q.toString()}`);
        if (d.pronto) { resultado = d.resultado; break; }
        msg(d.status === 'IN_QUEUE' ? 'Separando… (na fila)' : 'Separando voz e instrumentos…');
        await sleep(4000);
      }
      if (!resultado) throw new Error('A separação demorou demais. Tente de novo.');
      const stems = {};
      Object.entries(resultado).forEach(([k, v]) => { if (v && typeof v.url === 'string') stems[k] = v.url; });
      if (!Object.keys(stems).length) throw new Error('A separação não devolveu arquivos.');
      await api('/api/estudio/biblioteca', { method: 'PATCH', body: JSON.stringify({ id: m.id, stems }) });
      atualizarLocal(m.id, { stems });
      setAberta(m.id);
    });
  }

  function mandarParaFila(m) {
    if (!m.letra || !m.letra.trim()) {
      setAviso('A fila do canal precisa da letra. Essa música não tem letra salva (instrumental ou modo simples).');
      return;
    }
    if (!window.confirm(`Mandar "${m.titulo}" para a Fila de músicas do canal (vira vídeo e publica sozinho)?`)) return;
    comTrabalho(m.id, 'Mandando para a fila…', async () => {
      await api('/api/musica-fila-adicionar', {
        method: 'POST',
        body: JSON.stringify({
          audioUrl: m.audioUrl,
          letra: m.letra,
          titulo: m.titulo,
          formato: 'longo',
          textoThumbnail: (m.titulo || '').toUpperCase().slice(0, 40),
          ambiente: 'production',
        }),
      });
      setAviso(`"${m.titulo}" entrou na Fila de músicas.`);
    });
  }

  const lista = musicas.filter((m) => {
    if (filtro === 'favoritas' && !m.favorito) return false;
    if (filtro === 'elevenlabs' && m.motor !== 'elevenlabs') return false;
    if (filtro === 'lyria' && m.motor !== 'lyria') return false;
    if (filtro === 'medley' && m.tipo !== 'medley') return false;
    if (busca && !`${m.titulo} ${m.estilo} ${m.descricao}`.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const podeCriar = modo === 'simples' ? descricao.trim() : (instrumental || letra.trim());

  return (
    <>
      <Head><title>Estúdio de Música · Youvideo</title></Head>

      <div className="est">
        <header className="est-top">
          <a href="/" className="est-voltar">← Painel</a>
          <h1>Estúdio de Música</h1>
          <p className="subtitle">Descreva ou escreva sua letra, escolha o estilo e a IA cria a música completa.</p>
        </header>

        {aviso && (
          <div className="est-aviso" onClick={() => setAviso('')}>{aviso} <span>✕</span></div>
        )}

        <div className="est-grid">
          {/* ───────── Coluna de criação ───────── */}
          <section className="est-criar">
            <div className="est-abas">
              <button className={modo === 'simples' ? 'on' : ''} onClick={() => setModo('simples')}>Simples</button>
              <button className={modo === 'personalizado' ? 'on' : ''} onClick={() => setModo('personalizado')}>Personalizado</button>
              <button className={modo === 'medley' ? 'on' : ''} onClick={() => setModo('medley')}>Medley</button>
            </div>

            {modo === 'medley' ? (
              <>
                <label className="est-rot">Título do medley</label>
                <input value={medTitulo} onChange={(e) => setMedTitulo(e.target.value)} placeholder="Ex: 1 HORA DE LOUVOR — Sertanejo, Forró e Pagode Pra Deus" />

                <label className="est-rot">Tema geral</label>
                <textarea rows={3} value={medTema} onChange={(e) => setMedTema(e.target.value)} placeholder="Ex: gratidão a Deus e esperança no dia a dia" />

                <label className="est-rot">Músicas ({medFaixas.length})</label>
                <div className="est-faixas">
                  {medFaixas.map((f, i) => (
                    <div key={i} className="est-faixa">
                      <span className="est-faixa-n">{i + 1}</span>
                      <div className="est-faixa-campos">
                        <select value={f.estiloId} onChange={(e) => setMedFaixas((fs) => fs.map((x, k) => (k === i ? { ...x, estiloId: e.target.value } : x)))}>
                          {ESTILOS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select>
                        <input value={f.tema} onChange={(e) => setMedFaixas((fs) => fs.map((x, k) => (k === i ? { ...x, tema: e.target.value } : x)))} placeholder="Tema próprio (opcional)" />
                      </div>
                      <button className="est-faixa-x" disabled={medFaixas.length <= 2} onClick={() => setMedFaixas((fs) => fs.filter((_, k) => k !== i))}>✕</button>
                    </div>
                  ))}
                </div>
                {medFaixas.length < 10 && (
                  <button className="est-btn-sec est-add" onClick={() => setMedFaixas((fs) => [...fs, { estiloId: ESTILOS[fs.length % ESTILOS.length].id, tema: '' }])}>+ Adicionar música</button>
                )}

                <label className="est-rot">Voz</label>
                <div className="est-chips">
                  {VOZES.map((v) => (
                    <button key={v.id} className={voz === v.id ? 'on' : ''} onClick={() => setVoz(v.id)}>{v.nome}</button>
                  ))}
                </div>

                <label className="est-rot">Duração de cada música: {fmtTempo(duracao)}</label>
                <input type="range" min={60} max={300} step={15} value={duracao} onChange={(e) => setDuracao(+e.target.value)} />

                <label className="est-rot">Transição entre músicas: {crossfade}s</label>
                <input type="range" min={0} max={8} step={1} value={crossfade} onChange={(e) => setCrossfade(+e.target.value)} />

                <label className="est-rot">Motor de IA</label>
                <div className="est-motores">
                  {MOTORES.filter((m) => m.id !== 'comparar').map((m) => (
                    <button key={m.id} className={motor === m.id ? 'on' : ''} onClick={() => setMotor(m.id)}>
                      <strong>{m.nome}</strong>
                      <small>{m.id === 'lyria' ? '~R$0,50-1 por música' : '~R$3-5 por música'}</small>
                    </button>
                  ))}
                </div>

                <button className="est-criar-btn" disabled={!!medProgresso} onClick={criarMedley}>
                  🎶 Criar medley ({medFaixas.length} músicas · ~{fmtTempo(medFaixas.length * duracao)})
                </button>
                <small className="est-nota">A IA escreve cada letra, cria cada música e junta tudo num MP3 só. Leva uns 3 a 8 minutos. Deixe a tela aberta.</small>
              </>
            ) : (<>

            {modo === 'simples' ? (
              <>
                <label className="est-rot">Descreva sua música</label>
                <textarea
                  rows={5}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: um louvor emocionante sobre recomeçar depois de uma perda, com piano e voz masculina forte"
                  maxLength={1000}
                />
              </>
            ) : (
              <>
                <label className="est-rot">Título</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fé Que Levanta" />

                {!instrumental && (
                  <>
                    <label className="est-rot">Letra</label>
                    <div className="est-ia">
                      <input value={temaLetra} onChange={(e) => setTemaLetra(e.target.value)} placeholder="Tema para a IA escrever (ex: Deus nunca desiste de você)" />
                      <button className="est-btn-sec" disabled={escrevendo} onClick={() => escreverLetra(false)}>
                        {escrevendo ? 'Escrevendo…' : '✨ Escrever'}
                      </button>
                    </div>
                    <textarea
                      rows={12}
                      value={letra}
                      onChange={(e) => setLetra(e.target.value)}
                      placeholder={'[Verse]\nSua letra aqui…\n\n[Chorus]\nRefrão…'}
                      maxLength={3500}
                    />
                    <div className="est-linha">
                      <small>{letra.length}/3500 · use [Verse], [Chorus], [Bridge]</small>
                      {letra.trim() && (
                        <button className="est-link" disabled={escrevendo} onClick={() => escreverLetra(true)}>Melhorar letra com IA</button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            <label className="est-rot">Estilo</label>
            <div className="est-chips">
              {ESTILOS.map((e) => (
                <button key={e.id} className={estiloId === e.id ? 'on' : ''} onClick={() => setEstiloId(e.id)}>{e.nome}</button>
              ))}
            </div>
            <input
              value={estiloExtra}
              onChange={(e) => setEstiloExtra(e.target.value)}
              placeholder="Detalhes extras (opcional): violino, 90 bpm, estilo anos 80…"
            />

            <label className="est-toggle">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              <span>Instrumental (sem voz)</span>
            </label>

            {!instrumental && (
              <>
                <label className="est-rot">Voz</label>
                <div className="est-chips">
                  {VOZES.map((v) => (
                    <button key={v.id} className={voz === v.id ? 'on' : ''} onClick={() => setVoz(v.id)}>{v.nome}</button>
                  ))}
                </div>
              </>
            )}

            <label className="est-rot">Duração: {fmtTempo(duracao)}</label>
            <input type="range" min={30} max={300} step={15} value={duracao} onChange={(e) => setDuracao(+e.target.value)} />

            <label className="est-rot">Motor de IA</label>
            <div className="est-motores">
              {MOTORES.map((m) => (
                <button key={m.id} className={motor === m.id ? 'on' : ''} onClick={() => setMotor(m.id)}>
                  <strong>{m.nome}</strong>
                  <small>{m.desc}</small>
                </button>
              ))}
            </div>

            <button className="est-criar-btn" disabled={!podeCriar} onClick={() => criar()}>
              🎵 Criar música
            </button>
            <small className="est-nota">Cada clique gera 2 versões. Leva de 30 s a 2 min.</small>
            </>)}
          </section>

          {/* ───────── Biblioteca ───────── */}
          <section className="est-bib">
            <div className="est-bib-top">
              <h2>Minhas músicas</h2>
              <input className="est-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" />
            </div>
            <div className="est-chips est-filtros">
              {[['todas', 'Todas'], ['favoritas', '★ Favoritas'], ['medley', 'Medleys'], ['elevenlabs', 'ElevenLabs'], ['lyria', 'Lyria']].map(([id, nome]) => (
                <button key={id} className={filtro === id ? 'on' : ''} onClick={() => setFiltro(id)}>{nome}</button>
              ))}
              <button className={`est-juntar-toggle ${selecionando ? 'on' : ''}`} onClick={() => { setSelecionando(!selecionando); setSelecao([]); }}>
                {selecionando ? 'Cancelar seleção' : '🔗 Juntar músicas'}
              </button>
            </div>

            {selecionando && (
              <div className="est-selbar">
                <span>{selecao.length ? `${selecao.length} selecionadas, na ordem em que você clicou` : 'Clique nas músicas na ordem em que devem tocar'}</span>
                <button className="est-btn-sec" disabled={selecao.length < 2 || !!medProgresso} onClick={juntarSelecionadas}>Juntar em medley</button>
              </div>
            )}

            {medProgresso && (
              <div className={`est-card est-medprog ${medProgresso.erro ? 'erro' : ''}`}>
                <div className="est-medprog-top">
                  {medProgresso.erro ? '⚠️' : <span className="est-spin" />}
                  <strong>{medProgresso.titulo}</strong>
                </div>
                <div className="est-medprog-lista">
                  {medProgresso.etapas.map((e) => (
                    <div key={e.nome}><span>{e.nome}</span><span>{e.status}</span></div>
                  ))}
                  <div><span>Juntar tudo numa faixa</span><span>{medProgresso.fase === 'juntando' ? (medProgresso.erro ? '—' : 'juntando…') : 'esperando'}</span></div>
                </div>
                {medProgresso.erro && (
                  <div className="est-erro-txt">
                    {medProgresso.erro}
                    <button className="est-link" onClick={() => setMedProgresso(null)}>fechar</button>
                  </div>
                )}
              </div>
            )}

            {gerando.map((g) => (
              <div key={g.chave} className={`est-card est-gerando ${g.erro ? 'erro' : ''}`}>
                <div className="est-capa est-capa-vazia">{g.erro ? '⚠️' : <span className="est-spin" />}</div>
                <div className="est-info">
                  <div className="est-titulo">{g.titulo ? g.titulo.slice(0, 60) : 'Nova música'}</div>
                  {g.erro ? (
                    <div className="est-erro-txt">
                      {g.erro}
                      <button className="est-link" onClick={() => setGerando((x) => x.filter((y) => y.chave !== g.chave))}>fechar</button>
                    </div>
                  ) : (
                    <div className="est-meta">Criando com {nomeMotor(g.motor)}… {fmtTempo((agora - g.inicio) / 1000)}</div>
                  )}
                </div>
              </div>
            ))}

            {carregando && <p className="est-vazio">Carregando…</p>}
            {!carregando && !lista.length && !gerando.length && (
              <p className="est-vazio">Nenhuma música ainda. Crie a primeira ao lado 👈</p>
            )}

            {lista.map((m) => {
              const ativa = tocando?.id === m.id;
              const ocupado = trabalho[m.id];
              return (
                <div key={m.id} className={`est-card ${ativa ? 'ativa' : ''} ${selecionando ? 'sel' : ''} ${selecao.includes(m.id) ? 'marcada' : ''}`} onClick={selecionando ? () => alternarSelecao(m.id) : undefined}>
                  {selecionando && <span className="est-selnum">{selecao.includes(m.id) ? selecao.indexOf(m.id) + 1 : ''}</span>}
                  <button className="est-capa" onClick={(e) => { if (selecionando) return; e.stopPropagation(); tocar(m); }} style={m.capaUrl ? { backgroundImage: `url(${m.capaUrl})` } : undefined}>
                    <span className="est-play">{ativa && !pausado ? '❚❚' : '▶'}</span>
                  </button>
                  <div className="est-info">
                    <div className="est-titulo" onClick={() => setAberta(aberta === m.id ? null : m.id)}>
                      {m.titulo}
                      {m.versao ? <span className="est-v">v{m.versao}</span> : null}
                    </div>
                    <div className="est-meta">
                      <span className={`est-badge ${m.motor}`}>{nomeMotor(m.motor)}</span>
                      {m.tipo === 'medley' ? ` ${(m.faixas || []).length} músicas · ` : m.instrumental ? ' Instrumental · ' : ' '}
                      {fmtTempo(m.duracaoSeg)} · {new Date(m.criadoEm).toLocaleDateString('pt-BR')}
                    </div>
                    {ocupado && <div className="est-ocupado"><span className="est-spin" /> {ocupado}</div>}
                  </div>
                  <div className="est-acoes" style={selecionando ? { display: 'none' } : undefined}>
                    <button title="Favoritar" className={m.favorito ? 'fav' : ''} onClick={() => favoritar(m)}>{m.favorito ? '★' : '☆'}</button>
                    <button title="Baixar MP3" onClick={() => baixar(m.audioUrl, arquivoNome(m.titulo))}>⬇</button>
                    <button title="Mais opções" onClick={() => setAberta(aberta === m.id ? null : m.id)}>⋯</button>
                  </div>

                  {aberta === m.id && !selecionando && (
                    <div className="est-mais">
                      <div className="est-mais-btns">
                        {m.tipo === 'medley' ? (
                          <button disabled={!!ocupado} onClick={() => mandarParaMedleyCanal(m)}>📺 Mandar p/ Medley do canal</button>
                        ) : (
                          <>
                            <button disabled={!!ocupado} onClick={() => variacao(m)}>🔁 Nova versão</button>
                            <button onClick={() => reutilizar(m)}>✏️ Editar e recriar</button>
                          </>
                        )}
                        <button disabled={!!ocupado} onClick={() => gerarCapa(m)}>🎨 {m.capaUrl ? 'Nova capa' : 'Gerar capa'}</button>
                        <button disabled={!!ocupado} onClick={() => separarStems(m)}>🎚 Separar voz/instrumental</button>
                        {m.tipo !== 'medley' && <button disabled={!!ocupado} onClick={() => mandarParaFila(m)}>📺 Mandar p/ fila do canal</button>}
                        <a className="est-mais-a" href="/cover">🎤 Fazer cover com voz IA</a>
                        <button onClick={() => renomear(m)}>✎ Renomear</button>
                        <button className="perigo" onClick={() => excluir(m)}>🗑 Excluir</button>
                      </div>

                      {m.stems && Object.keys(m.stems).length > 0 && (
                        <div className="est-stems">
                          <strong>Faixas separadas:</strong>
                          {Object.entries(m.stems).map(([k, url]) => (
                            <div key={k} className="est-stem">
                              <span>{({ vocals: 'Voz', drums: 'Bateria', bass: 'Baixo', other: 'Outros', guitar: 'Guitarra', piano: 'Piano' })[k] || k}</span>
                              <audio controls preload="none" src={url} />
                              <button className="est-link" onClick={() => baixar(url, arquivoNome(`${m.titulo}-${k}`))}>baixar</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {m.capaUrl && (
                        <button className="est-link" onClick={() => baixar(m.capaUrl, arquivoNome(m.titulo, 'jpg'))}>Baixar capa</button>
                      )}

                      {m.tipo === 'medley' && (m.faixas || []).length > 0 && (
                        <div className="est-stems">
                          <strong>Músicas do medley:</strong>
                          {m.faixas.map((f, i) => (
                            <div key={i} className="est-stem">
                              <span>{i + 1}. {f.titulo}</span>
                              <audio controls preload="none" src={f.audioUrl} />
                              <button className="est-link" onClick={() => baixar(f.audioUrl, arquivoNome(f.titulo))}>baixar</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="est-detalhe">
                        {m.estilo && <p><strong>Estilo:</strong> {m.estilo}</p>}
                        {m.descricao && <p><strong>Descrição:</strong> {m.descricao}</p>}
                        {m.letra && <pre>{m.letra}</pre>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </div>

      {/* ───────── Player fixo ───────── */}
      <audio
        ref={audioRef}
        onPlay={() => setPausado(false)}
        onPause={() => setPausado(true)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPausado(true)}
      />
      {tocando && (
        <div className="est-player">
          <div className="est-player-capa" style={tocando.capaUrl ? { backgroundImage: `url(${tocando.capaUrl})` } : undefined} />
          <button className="est-player-play" onClick={() => tocar(tocando)}>{pausado ? '▶' : '❚❚'}</button>
          <div className="est-player-meio">
            <div className="est-player-titulo">{tocando.titulo}</div>
            <div className="est-player-barra">
              <span>{fmtTempo(pos)}</span>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.1}
                value={pos}
                onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = +e.target.value; }}
              />
              <span>{fmtTempo(dur)}</span>
            </div>
          </div>
          <button className="est-player-x" onClick={() => { audioRef.current?.pause(); setTocando(null); }}>✕</button>
        </div>
      )}

      <style jsx>{`
        .est { max-width: 1180px; margin: 0 auto; padding: 32px 20px 140px; }
        .est-top h1 { margin: 8px 0 4px; }
        .est-voltar { color: var(--text-muted); text-decoration: none; font-size: 14px; }
        .est-aviso { background: var(--gold-soft); border: 1px solid var(--gold); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; cursor: pointer; display: flex; justify-content: space-between; gap: 12px; }
        .est-grid { display: grid; grid-template-columns: 400px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 900px) { .est-grid { grid-template-columns: 1fr; } }

        .est-criar { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 14px; padding: 18px; position: sticky; top: 16px; }
        @media (max-width: 900px) { .est-criar { position: static; } }
        .est-abas { display: grid; grid-template-columns: 1fr 1fr 1fr; background: var(--bg); border-radius: 10px; padding: 4px; margin-bottom: 8px; }
        .est-abas button { background: none; border: 0; color: var(--text-muted); padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; }
        .est-abas button.on { background: var(--gold); color: #1a1407; }
        .est-rot { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
        .est textarea, .est input:not([type]), .est input[type='text'] { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px; font: inherit; font-size: 15px; resize: vertical; }
        .est textarea:focus, .est input:focus { outline: none; border-color: var(--gold); }
        .est input[type='range'] { width: 100%; accent-color: var(--gold); }
        .est-ia { display: flex; gap: 8px; margin-bottom: 8px; }
        .est-linha { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; color: var(--text-muted); gap: 8px; }
        .est-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .est-chips button { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
        .est-chips button.on { border-color: var(--gold); background: var(--gold-soft); color: var(--gold); }
        .est-toggle { display: flex; align-items: center; gap: 10px; margin-top: 16px; cursor: pointer; font-weight: 500; }
        .est-toggle input { width: 18px; height: 18px; accent-color: var(--gold); }
        .est-motores { display: grid; gap: 6px; }
        .est-motores button { text-align: left; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
        .est-motores button.on { border-color: var(--gold); background: var(--gold-soft); }
        .est-motores small { color: var(--text-muted); }
        .est-criar-btn { width: 100%; margin-top: 20px; padding: 16px; font-size: 18px; font-weight: 700; border: 0; border-radius: 12px; background: linear-gradient(135deg, #e7b453, #b1432f); color: #fff; cursor: pointer; }
        .est-criar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .est-nota { display: block; text-align: center; color: var(--text-muted); margin-top: 8px; }
        .est-btn-sec { white-space: nowrap; background: var(--gold-soft); border: 1px solid var(--gold); color: var(--gold); border-radius: 10px; padding: 0 14px; font-weight: 600; cursor: pointer; }
        .est-link { background: none; border: 0; color: var(--gold); cursor: pointer; font-size: 13px; padding: 4px 0; text-decoration: underline; }

        .est-bib-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .est-bib-top h2 { font-family: 'Fraunces', Georgia, serif; margin: 0; }
        .est-busca { max-width: 220px; }
        .est-filtros { margin: 12px 0 14px; }
        .est-vazio { color: var(--text-muted); text-align: center; padding: 40px 0; }

        .est-card { display: grid; grid-template-columns: 64px 1fr auto; gap: 14px; align-items: center; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; padding: 10px; margin-bottom: 8px; }
        .est-card.ativa { border-color: var(--gold); }
        .est-card.erro { border-color: var(--terracotta); }
        .est-capa { width: 64px; height: 64px; border-radius: 8px; border: 0; cursor: pointer; background: linear-gradient(135deg, #3a2e1a, #1c1811); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; position: relative; }
        .est-capa-vazia { cursor: default; }
        .est-play { background: rgba(0,0,0,0.55); color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .est-info { min-width: 0; }
        .est-titulo { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .est-v { font-size: 11px; color: var(--text-muted); margin-left: 6px; font-weight: 500; }
        .est-meta { color: var(--text-muted); font-size: 13px; margin-top: 3px; }
        .est-badge { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--teal-soft); color: #8fc4b6; }
        .est-badge.lyria { background: var(--terracotta-soft); color: #e38b77; }
        .est-erro-txt { color: #e38b77; font-size: 13px; }
        .est-ocupado { color: var(--gold); font-size: 13px; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
        .est-acoes { display: flex; gap: 4px; }
        .est-acoes button { width: 38px; height: 38px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); color: var(--text); cursor: pointer; font-size: 16px; }
        .est-acoes button.fav { color: var(--gold); border-color: var(--gold); }

        .est-mais { grid-column: 1 / -1; border-top: 1px solid var(--border); padding-top: 12px; }
        .est-mais-btns { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px; }
        .est-mais-btns button, .est-mais-a { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 11px 12px; text-align: left; cursor: pointer; font-size: 14px; text-decoration: none; }
        .est-mais-btns button:disabled { opacity: 0.4; }
        .est-mais-btns .perigo { color: #e38b77; }
        .est-stems { margin-top: 12px; display: grid; gap: 6px; }
        .est-stem { display: grid; grid-template-columns: 80px 1fr auto; gap: 8px; align-items: center; font-size: 14px; }
        .est-stem audio { width: 100%; height: 34px; }
        .est-detalhe { margin-top: 10px; font-size: 14px; color: var(--text-muted); }
        .est-detalhe pre { white-space: pre-wrap; font-family: inherit; background: var(--bg); border-radius: 8px; padding: 12px; color: var(--text); max-height: 320px; overflow: auto; }

        .est select { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 10px; font: inherit; }
        .est-faixas { display: grid; gap: 8px; }
        .est-faixa { display: grid; grid-template-columns: 26px 1fr 30px; gap: 8px; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
        .est-faixa-n { width: 26px; height: 26px; border-radius: 50%; background: var(--gold-soft); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
        .est-faixa-campos { display: grid; gap: 6px; }
        .est-faixa-campos select, .est-faixa-campos input { background: var(--bg-elevated) !important; padding: 8px 10px !important; font-size: 14px !important; }
        .est-faixa-x { background: none; border: 0; color: var(--text-muted); cursor: pointer; font-size: 15px; }
        .est-faixa-x:disabled { opacity: 0.3; }
        .est-add { width: 100%; padding: 10px; margin-top: 8px; }
        .est-juntar-toggle { margin-left: auto; border-style: dashed !important; }
        .est-selbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--gold-soft); border: 1px solid var(--gold); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; font-size: 14px; }
        .est-selbar .est-btn-sec { padding: 9px 14px; }
        .est-card.sel { cursor: pointer; grid-template-columns: 28px 64px 1fr; }
        .est-card.marcada { border-color: var(--gold); background: var(--gold-soft); }
        .est-selnum { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--gold); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
        .est-medprog { display: block; }
        .est-medprog-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .est-medprog-lista { display: grid; gap: 4px; font-size: 14px; }
        .est-medprog-lista div { display: flex; justify-content: space-between; gap: 12px; color: var(--text-muted); }
        .est-badge.medley { background: var(--gold-soft); color: var(--gold); }
        .est-spin { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--gold); border-radius: 50%; display: inline-block; animation: gira 0.8s linear infinite; }
        .est-gerando .est-spin { width: 26px; height: 26px; }
        @keyframes gira { to { transform: rotate(360deg); } }

        .est-player { position: fixed; left: 0; right: 0; bottom: 0; background: #0f0d0a; border-top: 1px solid var(--border); padding: 10px 16px; display: flex; align-items: center; gap: 12px; z-index: 50; }
        .est-player-capa { width: 48px; height: 48px; border-radius: 6px; background: linear-gradient(135deg, #3a2e1a, #1c1811); background-size: cover; background-position: center; flex-shrink: 0; }
        .est-player-play { width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--gold); color: #1a1407; font-size: 14px; cursor: pointer; flex-shrink: 0; }
        .est-player-meio { flex: 1; min-width: 0; }
        .est-player-titulo { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .est-player-barra { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
        .est-player-x { background: none; border: 0; color: var(--text-muted); font-size: 18px; cursor: pointer; }
      `}</style>
    </>
  );
}
