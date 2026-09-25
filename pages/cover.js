import { useEffect, useState } from 'react';
import Head from 'next/head';
import { upload } from '@vercel/blob/client';

// ───────────────────────── Estilos, letras e vozes prontas ─────────────────────────

const ESTILOS = [
  { id: 'gospel', nome: 'Gospel / Louvor', emoji: '🙏', base: 'Brazilian gospel worship, modern, emotional, soft piano and pads' },
  { id: 'sertanejo', nome: 'Sertanejo', emoji: '🤠', base: 'Brazilian sertanejo, romantic, acoustic guitar' },
  { id: 'gaucha', nome: 'Gaúcha / Nativista', emoji: '🧉', base: 'Southern Brazilian gaucho music, milonga, nylon guitar, soft accordion' },
  { id: 'pagode', nome: 'Pagode / Samba', emoji: '🥁', base: 'Brazilian pagode, samba, cavaquinho, light percussion' },
  { id: 'mpb', nome: 'MPB / Acústico', emoji: '🎸', base: 'Brazilian MPB, acoustic, bossa nova touch, nylon guitar' },
  { id: 'pop', nome: 'Pop', emoji: '✨', base: 'Brazilian pop, modern, catchy, clean production' },
  { id: 'rock', nome: 'Rock', emoji: '🤘', base: 'Brazilian rock, electric guitar, energetic' },
  { id: 'forro', nome: 'Forró / Piseiro', emoji: '🪗', base: 'Brazilian forro, piseiro, accordion, zabumba, danceable' },
  { id: 'infantil', nome: 'Infantil', emoji: '🎈', base: "Children's song, playful, cheerful, cartoon style" },
];

const SUFIXO = 'solo lead vocal loud, clear and upfront, minimal soft accompaniment, no choir, no backing vocals, sung in Brazilian Portuguese';

// Letras curtas e originais, só para gerar a amostra de voz de cada estilo
const LETRAS = {
  gospel: `[verse]\nQuando a noite vem e o medo quer ficar\nEu levanto os olhos, sei que vais me guiar\nNo silêncio escuto a tua voz a me chamar\n[chorus]\nTua luz me alcança, teu amor me faz cantar\nEu não ando sozinho, tu estás em todo lugar`,
  sertanejo: `[verse]\nA estrada é comprida e a saudade não tem fim\nNo rádio a mesma moda que tu cantava pra mim\n[chorus]\nVolta pra esse peito que ainda é teu lugar\nO violão tá chorando, só tu pode consolar`,
  gaucha: `[verse]\nNo fogo de chão a cuia vai passando\nO vento minuano lá fora vai cantando\n[chorus]\nSou filho do pampa, do campo e do luar\nLevo na garganta o jeito de payar`,
  pagode: `[verse]\nChegou o fim de semana, a roda vai começar\nCavaco afinado, a turma vem pra cantar\n[chorus]\nDeixa a vida levar, deixa o samba falar\nQuem tem amigo do lado não precisa se preocupar`,
  mpb: `[verse]\nA janela aberta, o café no fogão\nA manhã desenhando poesia no chão\n[chorus]\nFica mais um pouco, deixa o tempo passar\nTem canção que só nasce quando a gente para pra olhar`,
  pop: `[verse]\nAcende a cidade, o céu tá brilhando\nO coração dispara, a gente vai dançando\n[chorus]\nHoje é a nossa noite, ninguém vai segurar\nLevanta a mão comigo, deixa a música tocar`,
  rock: `[verse]\nO motor ruge alto no asfalto sem fim\nEu não peço licença, o mundo é assim\n[chorus]\nGrita comigo, sente a guitarra queimar\nNinguém vai me parar, eu nasci pra voar`,
  forro: `[verse]\nA sanfona chamou, o salão encheu\nNo arrasta-pé quem dança melhor sou eu\n[chorus]\nChega mais pertinho, vem forrozear\nNo balanço do xote a gente não quer parar`,
  infantil: `[verse]\nO sol acordou e veio brincar\nO passarinho pulou pra cantar\n[chorus]\nBate palminha, roda e pula também\nA alegria é bonita quando a gente faz o bem`,
};

const PRESETS = [
  { id: 'gospel-nf', estilo: 'gospel', nome: 'Cantor Nova Frequência', voz: 'young adult male worship vocal, warm, modern, emotional', dica: 'Melhor ainda: envie um trecho do seu cantor em "Enviar amostra".' },
  { id: 'gospel-f-potente', estilo: 'gospel', nome: 'Voz Feminina Worship', voz: 'powerful female gospel vocal, strong belting, emotional' },
  { id: 'gospel-f-suave', estilo: 'gospel', nome: 'Voz Feminina Suave', voz: 'soft gentle female worship vocal, intimate, breathy' },
  { id: 'sert-m-drive', estilo: 'sertanejo', nome: 'Sertanejo com Drive', voz: 'male sertanejo vocal with light rasp, strong, heartfelt' },
  { id: 'sert-m-romantico', estilo: 'sertanejo', nome: 'Sertanejo Romântico', voz: 'smooth romantic male sertanejo vocal, clean tenor' },
  { id: 'sert-f-feminejo', estilo: 'sertanejo', nome: 'Feminejo', voz: 'confident female sertanejo vocal, bright, feminejo style' },
  { id: 'gau-m-grave', estilo: 'gaucha', nome: 'Voz Grave de Milonga', voz: 'deep baritone male vocal, calm, storytelling' },
  { id: 'gau-m-galpao', estilo: 'gaucha', nome: 'Voz de Galpão', voz: 'rustic male folk vocal, warm, slightly rough, traditional' },
  { id: 'pag-m-suave', estilo: 'pagode', nome: 'Pagodeiro Suave', voz: 'smooth relaxed male pagode vocal, charming, swing' },
  { id: 'pag-f-roda', estilo: 'pagode', nome: 'Voz de Roda de Samba', voz: 'joyful female samba vocal, warm, rhythmic' },
  { id: 'mpb-m-intimista', estilo: 'mpb', nome: 'MPB Intimista', voz: 'soft intimate male vocal, gentle, close to the mic' },
  { id: 'mpb-f-doce', estilo: 'mpb', nome: 'MPB Doce', voz: 'sweet delicate female vocal, soft, bossa nova style' },
  { id: 'pop-m-jovem', estilo: 'pop', nome: 'Pop Masculino Jovem', voz: 'young male pop vocal, bright, modern' },
  { id: 'pop-f-brilhante', estilo: 'pop', nome: 'Pop Feminino Brilhante', voz: 'bright energetic female pop vocal, clear, modern' },
  { id: 'rock-m-rasgada', estilo: 'rock', nome: 'Rock Rasgado', voz: 'raspy powerful male rock vocal, gritty' },
  { id: 'rock-f', estilo: 'rock', nome: 'Rock Feminino', voz: 'strong female rock vocal, edgy, powerful' },
  { id: 'forro-m-animada', estilo: 'forro', nome: 'Forrozeiro Animado', voz: 'energetic male forro vocal, northeastern Brazilian accent, festive' },
  { id: 'inf-alegre', estilo: 'infantil', nome: 'Voz Alegre de Desenho', voz: 'cheerful playful bright cartoon-like vocal, friendly' },
];

const OITAVAS = [
  { v: 0, nome: 'Mesma altura' },
  { v: -12, nome: 'Uma oitava abaixo', dica: 'música de voz feminina → voz masculina' },
  { v: 12, nome: 'Uma oitava acima', dica: 'música de voz masculina → voz feminina' },
];

// ───────────────────────── Funções auxiliares ─────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let d = {};
  try { d = await r.json(); } catch { /* sem json */ }
  if (!r.ok || d.erro) throw new Error(d.erro || `Erro ${r.status}`);
  return d;
}

function acharUrl(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return /^https?:\/\//.test(obj) ? obj : null;
  if (typeof obj.url === 'string') return obj.url;
  for (const v of Object.values(obj)) { const u = acharUrl(v); if (u) return u; }
  return null;
}

function textoFila(d) {
  if (d.status === 'IN_QUEUE') return d.fila != null ? `na fila (posição ${d.fila})` : 'na fila';
  return 'processando';
}

async function aguardarFal(job, aoAtualizar) {
  const fim = Date.now() + 20 * 60 * 1000;
  while (Date.now() < fim) {
    const q = new URLSearchParams({ statusUrl: job.statusUrl, responseUrl: job.responseUrl });
    const d = await api(`/api/cover/fal?${q.toString()}`);
    if (d.pronto) return d.resultado;
    aoAtualizar && aoAtualizar(textoFila(d));
    await sleep(4000);
  }
  throw new Error('Demorou demais. Tente de novo.');
}

async function separar(audioUrl, aoAtualizar) {
  const job = await api('/api/cover/fal', { method: 'POST', body: JSON.stringify({ tipo: 'separar', audioUrl }) });
  const r = await aguardarFal(job, aoAtualizar);
  const voz = r && r.vocals && r.vocals.url;
  const instrumentos = Object.entries(r || {})
    .filter(([k, v]) => k !== 'vocals' && v && typeof v.url === 'string')
    .map(([, v]) => v.url);
  if (!voz) throw new Error('A separação não devolveu a voz.');
  return { voz, instrumentos };
}

async function rodarReplicate(corpo, msgRodando, aoAtualizar, minutos) {
  const { id } = await api('/api/cover/replicate', { method: 'POST', body: JSON.stringify(corpo) });
  const fim = Date.now() + minutos * 60 * 1000;
  while (Date.now() < fim) {
    const d = await api(`/api/cover/replicate?id=${id}`);
    if (d.pronto) return d.url;
    aoAtualizar && aoAtualizar(d.status === 'starting' ? 'ligando a máquina de IA (pode levar 1-3 min)' : msgRodando);
    await sleep(8000);
  }
  throw new Error('Demorou demais no Replicate. Tente de novo.');
}

// Treina a voz (RVC) a partir de um áudio só com voz e salva na biblioteca
async function treinarESalvarVoz({ vozAudioUrl, nome, estilo, presetId, descricao, origem }, aoAtualizar) {
  aoAtualizar('Preparando a voz para o treino');
  const prep = await api('/api/cover/vozes', { method: 'POST', body: JSON.stringify({ etapa: 'preparar', audioUrl: vozAudioUrl }) });
  const modeloTempUrl = await rodarReplicate(
    { acao: 'treinar', datasetUrl: prep.datasetUrl },
    `Treinando a voz com ${prep.segundos}s de canto (10-20 min, deixe a tela aberta)`,
    aoAtualizar, 60,
  );
  aoAtualizar('Salvando na biblioteca');
  const d = await api('/api/cover/vozes', {
    method: 'POST',
    body: JSON.stringify({ etapa: 'salvar', nome, estilo, presetId, descricao, origem, amostraUrl: prep.amostraUrl, modeloTempUrl, datasetUrl: prep.datasetUrl }),
  });
  return d.voz;
}

async function enviarArquivo(file) {
  const nome = `cover/uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  if (file.size > 500 * 1024 * 1024) throw new Error('Arquivo acima de 500 MB. Converta para MP3 antes de enviar.');
  const blob = await upload(nome, file, {
    access: 'public',
    handleUploadUrl: '/api/cover/upload',
    multipart: file.size > 30 * 1024 * 1024, // arquivos grandes vão em partes
  });
  return blob.url;
}

// ───────────────────────── Componentes ─────────────────────────

function CartaoVoz({ titulo, descricao, dica, voz, selecionada, criandoMsg, onSelecionar, onCriar, onApagar }) {
  return (
    <div className={`cv-cartao ${selecionada ? 'cv-sel' : ''}`}>
      <div className="cv-cartao-topo">
        <strong>{titulo}</strong>
        {voz && <span className="cv-tag">{!voz.modeloUrl ? 'refazer' : voz.origem === 'enviada' ? 'enviada' : 'pronta'}</span>}
      </div>
      {descricao && <p className="cv-desc">{descricao}</p>}
      {dica && !voz && <p className="cv-dica">💡 {dica}</p>}

      {voz && <audio controls preload="none" src={voz.amostraUrl} className="cv-audio" />}

      {criandoMsg ? (
        <div className="cv-carregando"><span className="cv-spin" /> {criandoMsg}</div>
      ) : (
        <div className="cv-botoes">
          {voz && voz.modeloUrl && onSelecionar && (
            <button className={`cv-btn ${selecionada ? 'cv-btn-ok' : 'cv-btn-pri'}`} onClick={onSelecionar}>
              {selecionada ? '✓ Selecionada' : 'Usar esta voz'}
            </button>
          )}
          {onCriar && (
            <button className={`cv-btn ${voz ? 'cv-btn-sec' : 'cv-btn-pri'}`} onClick={onCriar}>
              {voz ? '↻ Refazer voz' : '✨ Criar voz (≈ R$3 a R$6)'}
            </button>
          )}
          {voz && onApagar && <button className="cv-btn cv-btn-perigo" onClick={onApagar}>Apagar</button>}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Página ─────────────────────────

export default function CoverIA() {
  const [aba, setAba] = useState('cover');
  const [vozes, setVozes] = useState([]);
  const [carregandoVozes, setCarregandoVozes] = useState(true);
  const [criando, setCriando] = useState({});
  const [aviso, setAviso] = useState(null);

  // cover
  const [musica, setMusica] = useState(null);
  const [enviandoMusica, setEnviandoMusica] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [estilo, setEstilo] = useState('gospel');
  const [vozSel, setVozSel] = useState(null);
  const [oitava, setOitava] = useState(0);
  const [volumeVoz, setVolumeVoz] = useState(1);
  const [etapa, setEtapa] = useState(null); // 0,1,2 | 'pronto' | null
  const [etapaMsg, setEtapaMsg] = useState('');
  const [resultado, setResultado] = useState(null);
  const [erroCover, setErroCover] = useState('');

  // biblioteca
  const [novaNome, setNovaNome] = useState('');
  const [novaEstilo, setNovaEstilo] = useState('gospel');
  const [novaDesc, setNovaDesc] = useState('');
  const [amostraArq, setAmostraArq] = useState(null);
  const [amostraNome, setAmostraNome] = useState('');
  const [amostraEstilo, setAmostraEstilo] = useState('gospel');
  const [amostraTemInstrumental, setAmostraTemInstrumental] = useState(true);
  const [confirmoVoz, setConfirmoVoz] = useState(false);

  // histórico
  const [projetos, setProjetos] = useState([]);

  // separador
  const [sepFila, setSepFila] = useState([]); // { id, nome, file, status, msg, resultado, erro }
  const [sepRodando, setSepRodando] = useState(false);
  const [sepModo, setSepModo] = useState('rapido'); // 'rapido' (fal.ai) | 'gratis' (GitHub Actions)
  const [carregandoProjetos, setCarregandoProjetos] = useState(false);

  const rodando = typeof etapa === 'number';

  function mostrarAviso(texto, tipo = 'ok') {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 6000);
  }

  function setCriandoMsg(chave, msg) {
    setCriando((c) => { const n = { ...c }; if (msg == null) delete n[chave]; else n[chave] = msg; return n; });
  }

  async function carregarVozes() {
    try {
      const d = await api('/api/cover/vozes');
      setVozes(d.vozes || []);
    } catch (e) { mostrarAviso('Não carreguei as vozes: ' + e.message, 'erro'); }
    finally { setCarregandoVozes(false); }
  }

  async function carregarProjetos() {
    setCarregandoProjetos(true);
    try { const d = await api('/api/cover/mixar'); setProjetos(d.projetos || []); }
    catch (e) { mostrarAviso('Não carreguei o histórico: ' + e.message, 'erro'); }
    finally { setCarregandoProjetos(false); }
  }

  useEffect(() => { carregarVozes(); }, []);
  useEffect(() => { if (aba === 'historico') carregarProjetos(); }, [aba]);

  const vozDoPreset = (id) => vozes.find((v) => v.presetId === id) || null;
  const vozSelecionada = vozes.find((v) => v.id === vozSel) || null;

  // ── criar voz gerada por IA (preset ou descrição própria)
  async function criarVozGerada({ chave, nome, estiloId, presetId, descricao, promptVoz }) {
    const est = ESTILOS.find((e) => e.id === estiloId);
    const prompt = `${est.base}, ${promptVoz}, ${SUFIXO}`.slice(0, 300);
    try {
      setCriandoMsg(chave, 'Compondo um trecho cantado...');
      const letra = `${LETRAS[estiloId]}\n${LETRAS[estiloId]}\n${LETRAS[estiloId].replace('[verse]', '[bridge]')}`;
      const job = await api('/api/cover/fal', { method: 'POST', body: JSON.stringify({ tipo: 'gerarVoz', prompt, letra }) });
      const r = await aguardarFal(job, (m) => setCriandoMsg(chave, `Compondo um trecho cantado (${m})...`));
      const musicaUrl = acharUrl(r);
      if (!musicaUrl) throw new Error('O gerador de música não devolveu áudio.');
      setCriandoMsg(chave, 'Separando só a voz...');
      const { voz } = await separar(musicaUrl, (m) => setCriandoMsg(chave, `Separando só a voz (${m})...`));
      const antiga = presetId ? vozes.find((v) => v.presetId === presetId) : null;
      const nova = await treinarESalvarVoz(
        { vozAudioUrl: voz, nome, estilo: estiloId, presetId, descricao, origem: 'gerada' },
        (m) => setCriandoMsg(chave, `${m}...`),
      );
      if (antiga) await api(`/api/cover/vozes?id=${antiga.id}`, { method: 'DELETE' }).catch(() => {});
      await carregarVozes();
      if (aba === 'cover' && estiloId === estilo) setVozSel(nova.id);
      mostrarAviso(`Voz "${nome}" criada! Ouça a amostra.`);
    } catch (e) {
      mostrarAviso('Não deu pra criar a voz: ' + e.message, 'erro');
    } finally {
      setCriandoMsg(chave, null);
    }
  }

  function criarPreset(p) {
    return criarVozGerada({ chave: p.id, nome: p.nome, estiloId: p.estilo, presetId: p.id, descricao: p.voz, promptVoz: p.voz });
  }

  async function criarPersonalizada() {
    if (!novaNome.trim() || !novaDesc.trim()) return mostrarAviso('Preencha o nome e a descrição da voz.', 'erro');
    await criarVozGerada({ chave: 'personalizada', nome: novaNome.trim(), estiloId: novaEstilo, presetId: null, descricao: novaDesc.trim(), promptVoz: novaDesc.trim() });
    setNovaNome(''); setNovaDesc('');
  }

  async function enviarAmostra() {
    if (!amostraArq || !amostraNome.trim()) return mostrarAviso('Escolha o arquivo e dê um nome para a voz.', 'erro');
    if (!confirmoVoz) return mostrarAviso('Confirme que a voz é sua, do seu personagem ou autorizada.', 'erro');
    const chave = 'amostra';
    try {
      setCriandoMsg(chave, 'Enviando o áudio...');
      let url = await enviarArquivo(amostraArq);
      if (amostraTemInstrumental) {
        setCriandoMsg(chave, 'Separando só a voz...');
        const { voz } = await separar(url, (m) => setCriandoMsg(chave, `Separando só a voz (${m})...`));
        url = voz;
      }
      await treinarESalvarVoz(
        { vozAudioUrl: url, nome: amostraNome.trim(), estilo: amostraEstilo, presetId: null, descricao: 'Voz enviada', origem: 'enviada' },
        (m) => setCriandoMsg(chave, `${m}...`),
      );
      await carregarVozes();
      mostrarAviso(`Voz "${amostraNome.trim()}" salva!`);
      setAmostraArq(null); setAmostraNome(''); setConfirmoVoz(false);
    } catch (e) {
      mostrarAviso('Não deu pra salvar a amostra: ' + e.message, 'erro');
    } finally {
      setCriandoMsg(chave, null);
    }
  }

  async function apagarVoz(v) {
    if (!confirm(`Apagar a voz "${v.nome}"?`)) return;
    try {
      await api(`/api/cover/vozes?id=${v.id}`, { method: 'DELETE' });
      if (vozSel === v.id) setVozSel(null);
      await carregarVozes();
    } catch (e) { mostrarAviso('Não apaguei: ' + e.message, 'erro'); }
  }

  // ── cover
  async function escolherMusica(file) {
    if (!file) return;
    setEnviandoMusica(true); setResultado(null); setErroCover('');
    try {
      const url = await enviarArquivo(file);
      setMusica({ url, nome: file.name });
      if (!titulo) setTitulo(file.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      mostrarAviso('Falha ao enviar a música: ' + e.message, 'erro');
    } finally { setEnviandoMusica(false); }
  }

  async function gerarCover() {
    if (!musica || !vozSelecionada) return;
    setResultado(null); setErroCover('');
    try {
      setEtapa(0); setEtapaMsg('começando');
      let coverTempUrl = null;
      await rodarReplicate(
        { acao: 'cover', musicaUrl: musica.url, modeloUrl: vozSelecionada.modeloUrl, tom: oitava, volumeVoz },
        'separando voz e instrumental e cantando com a voz nova',
        (m) => { setEtapa(m.startsWith('ligando') ? 0 : 1); setEtapaMsg(m); },
        30,
      ).then((u) => { coverTempUrl = u; });

      setEtapa(2); setEtapaMsg('salvando o áudio');
      const d = await api('/api/cover/mixar', {
        method: 'POST',
        body: JSON.stringify({ coverTempUrl, titulo, vozNome: vozSelecionada.nome, estilo }),
      });
      setResultado(d.projeto);
      setEtapa('pronto');
    } catch (e) {
      setErroCover(e.message);
      setEtapa(null);
    }
  }

  async function copiar(url) {
    try { await navigator.clipboard.writeText(url); mostrarAviso('Link copiado!'); }
    catch { mostrarAviso('Não consegui copiar. Segure no link para copiar.', 'erro'); }
  }

  const ETAPAS = ['Ligando a máquina de IA', 'Separando e cantando com a voz nova', 'Salvando o cover'];
  const presetsDoEstilo = PRESETS.filter((p) => p.estilo === estilo);
  const personalizadasDoEstilo = vozes.filter((v) => v.estilo === estilo && !v.presetId);

  function adicionarNaFila(files) {
    const novos = Array.from(files || []).map((file) => ({
      id: `${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      nome: file.name,
      file,
      status: 'aguardando',
      msg: '',
    }));
    if (novos.length) setSepFila((f) => [...f, ...novos]);
  }

  function atualizarItem(id, campos) {
    setSepFila((f) => f.map((it) => (it.id === id ? { ...it, ...campos } : it)));
  }

  function tirarDaFila(id) {
    setSepFila((f) => f.filter((it) => it.id !== id));
  }

  async function processarItem(it) {
    try {
      atualizarItem(it.id, { status: 'rodando', msg: 'Enviando', erro: '' });
      const url = await enviarArquivo(it.file);
      if (sepModo === 'gratis') {
        const titulo = it.nome.replace(/\.[^.]+$/, '');
        const { jobId } = await api('/api/cover/gratis', { method: 'POST', body: JSON.stringify({ audioUrl: url, titulo }) });
        const textos = { 'na-fila': 'Na fila do GitHub (pode levar 1-2 min pra começar)', rodando: 'Separando no GitHub (5-10 min)' };
        const fim = Date.now() + 50 * 60 * 1000;
        while (Date.now() < fim) {
          await sleep(10000);
          const d = await api(`/api/cover/gratis?id=${jobId}`);
          if (d.status === 'pronto' && d.projeto) { atualizarItem(it.id, { status: 'pronto', msg: '', resultado: d.projeto }); return; }
          if (d.status === 'erro') throw new Error(d.erro || 'O GitHub não conseguiu separar esta música. Veja a aba Actions do repositório.');
          atualizarItem(it.id, { msg: textos[d.status] || 'Processando' });
        }
        throw new Error('Demorou demais no GitHub. Veja se aparece no Histórico mais tarde.');
      }
      atualizarItem(it.id, { msg: 'Separando voz e instrumental' });
      const { voz, instrumentos } = await separar(url, (m) => atualizarItem(it.id, { msg: `Separando (${m})` }));
      if (!instrumentos.length) throw new Error('A separação não devolveu o instrumental.');
      atualizarItem(it.id, { msg: 'Salvando' });
      const d = await api('/api/cover/mixar', {
        method: 'POST',
        body: JSON.stringify({ tipo: 'separar', vozUrl: voz, instrumentosUrls: instrumentos, titulo: it.nome.replace(/\.[^.]+$/, '') }),
      });
      atualizarItem(it.id, { status: 'pronto', msg: '', resultado: d.projeto });
    } catch (e) {
      atualizarItem(it.id, { status: 'erro', msg: '', erro: e.message });
    }
  }

  async function separarTodas() {
    const pendentes = sepFila.filter((it) => it.status === 'aguardando' || it.status === 'erro');
    if (!pendentes.length) return;
    setSepRodando(true);
    // 2 músicas ao mesmo tempo
    let i = 0;
    const trabalhador = async () => { while (i < pendentes.length) { const it = pendentes[i++]; await processarItem(it); } };
    await Promise.all([trabalhador(), trabalhador()]);
    setSepRodando(false);
    mostrarAviso('Fila terminada!');
  }

  function Downloads({ p }) {
    return (
      <div className="cv-downloads">
        {[['🎤 Cover completo', p.coverUrl], ['🎹 Só instrumental', p.instrumentalUrl], [p.tipo === 'separar' ? '🗣️ Só a voz original' : '🗣️ Só a voz nova', p.vozUrl]].filter(([, url]) => url).map(([rotulo, url]) => (
          <div key={rotulo} className="cv-down-item">
            <span>{rotulo}</span>
            <audio controls preload="none" src={url} className="cv-audio" />
            <div className="cv-botoes">
              <a className="cv-btn cv-btn-pri" href={url} target="_blank" rel="noreferrer" download>⬇ Baixar</a>
              <button className="cv-btn cv-btn-sec" onClick={() => copiar(url)}>Copiar link</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Cover IA · Youvideo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cv-pagina">
        <header className="cv-topo">
          <a href="/" className="cv-voltar">← Painel</a>
          <h1>🎙️ Cover IA</h1>
          <p>Separe voz e instrumental e cante a música com uma voz de IA.</p>
        </header>

        <nav className="cv-abas">
          {[['cover', '🎵 Fazer cover'], ['separar', '✂️ Só separar'], ['vozes', '🗂️ Biblioteca de vozes'], ['historico', '📜 Histórico']].map(([id, nome]) => (
            <button key={id} className={`cv-aba ${aba === id ? 'cv-aba-ativa' : ''}`} onClick={() => setAba(id)}>{nome}</button>
          ))}
        </nav>

        {aviso && <div className={`cv-aviso ${aviso.tipo === 'erro' ? 'cv-aviso-erro' : ''}`}>{aviso.texto}</div>}

        {/* ───────── ABA: FAZER COVER ───────── */}
        {aba === 'cover' && (
          <>
            <section className="cv-secao">
              <h2><span className="cv-num">1</span> Música</h2>
              <label className={`cv-upload ${enviandoMusica ? 'cv-desab' : ''}`}>
                <input type="file" accept="audio/*" disabled={enviandoMusica || rodando} onChange={(e) => escolherMusica(e.target.files[0])} />
                {enviandoMusica ? <><span className="cv-spin" /> Enviando música...</> : musica ? `✓ ${musica.nome} (toque para trocar)` : '📁 Escolher música (MP3, WAV, M4A)'}
              </label>
              {musica && <audio controls preload="none" src={musica.url} className="cv-audio" />}
              <input className="cv-input" placeholder="Título do cover (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </section>

            <section className="cv-secao">
              <h2><span className="cv-num">2</span> Estilo da música</h2>
              <div className="cv-chips">
                {ESTILOS.map((e) => (
                  <button key={e.id} className={`cv-chip ${estilo === e.id ? 'cv-chip-ativo' : ''}`} onClick={() => { setEstilo(e.id); setVozSel(null); }}>
                    {e.emoji} {e.nome}
                  </button>
                ))}
              </div>
            </section>

            <section className="cv-secao">
              <h2><span className="cv-num">3</span> Voz do cover</h2>
              {carregandoVozes ? (
                <div className="cv-carregando"><span className="cv-spin" /> Carregando vozes...</div>
              ) : (
                <div className="cv-grade">
                  {presetsDoEstilo.map((p) => {
                    const v = vozDoPreset(p.id);
                    return (
                      <CartaoVoz key={p.id} titulo={p.nome} dica={p.dica} voz={v} selecionada={v && vozSel === v.id}
                        criandoMsg={criando[p.id]} onSelecionar={v ? () => setVozSel(v.id) : null} onCriar={() => criarPreset(p)} />
                    );
                  })}
                  {personalizadasDoEstilo.map((v) => (
                    <CartaoVoz key={v.id} titulo={v.nome} descricao={v.descricao} voz={v} selecionada={vozSel === v.id}
                      onSelecionar={() => setVozSel(v.id)} onApagar={() => apagarVoz(v)} />
                  ))}
                </div>
              )}
              <p className="cv-dica">Vozes com ✨ ainda não foram criadas: toque em "Criar voz". A voz é treinada uma vez só (10-20 min, deixe a tela aberta) e fica salva pra sempre.</p>
            </section>

            <section className="cv-secao">
              <h2><span className="cv-num">4</span> Ajustes</h2>
              <div className="cv-opcoes">
                {OITAVAS.map((o) => (
                  <button key={o.v} className={`cv-opcao ${oitava === o.v ? 'cv-opcao-ativa' : ''}`} onClick={() => setOitava(o.v)}>
                    <strong>{o.nome}</strong>{o.dica && <small>{o.dica}</small>}
                  </button>
                ))}
              </div>
              <label className="cv-slider">
                Volume da voz: <strong>{Math.round(volumeVoz * 100)}%</strong>
                <input type="range" min="0.5" max="1.6" step="0.05" value={volumeVoz} onChange={(e) => setVolumeVoz(Number(e.target.value))} />
              </label>
            </section>

            <button className="cv-btn-grande" disabled={!musica || !vozSelecionada || rodando || enviandoMusica} onClick={gerarCover}>
              {rodando ? <><span className="cv-spin" /> Gerando cover...</> : '🎤 Gerar cover (≈ R$1 a R$2)'}
            </button>
            {!rodando && (!musica || !vozSelecionada) && (
              <p className="cv-dica cv-centro">{!musica ? 'Escolha a música primeiro.' : 'Escolha uma voz pronta (ou crie uma).'}</p>
            )}

            {(rodando || etapa === 'pronto') && (
              <div className="cv-progresso">
                {ETAPAS.map((nome, i) => {
                  const feito = etapa === 'pronto' || (typeof etapa === 'number' && i < etapa);
                  const atual = etapa === i;
                  return (
                    <div key={nome} className={`cv-passo ${feito ? 'cv-feito' : ''} ${atual ? 'cv-atual' : ''}`}>
                      <span className="cv-bola">{feito ? '✓' : atual ? <span className="cv-spin" /> : i + 1}</span>
                      <div><strong>{nome}</strong>{atual && <small>{etapaMsg}...</small>}</div>
                    </div>
                  );
                })}
                {rodando && <p className="cv-dica">Leva de 3 a 8 minutos. Deixe a tela aberta.</p>}
              </div>
            )}

            {erroCover && <div className="cv-aviso cv-aviso-erro">❌ {erroCover}</div>}

            {resultado && (
              <section className="cv-secao cv-resultado">
                <h2>✅ Cover pronto: {resultado.titulo}</h2>
                <Downloads p={resultado} />
                <p className="cv-dica">Ao publicar no YouTube, marque "conteúdo alterado ou sintético". Com músicas de outros artistas, o YouTube pode reivindicar direitos.</p>
              </section>
            )}
          </>
        )}

        {/* ───────── ABA: SÓ SEPARAR ───────── */}
        {aba === 'separar' && (() => {
          const pendentes = sepFila.filter((it) => it.status === 'aguardando' || it.status === 'erro').length;
          const prontas = sepFila.filter((it) => it.status === 'pronto').length;
          return (
            <>
              <section className="cv-secao">
                <h2>✂️ Separar voz e instrumental</h2>
                <p className="cv-dica">Sem trocar a voz: cada música vira só o instrumental (playback) e só a voz original. Pode escolher várias de uma vez.</p>
                <div className="cv-opcoes">
                  {[['rapido', '⚡ Rápido', '≈ R$1 por música · 1-2 min'], ['gratis', '🆓 Grátis', 'pelo GitHub · 5-10 min por música']].map(([id, nome, dica]) => (
                    <button key={id} className={`cv-opcao ${sepModo === id ? 'cv-opcao-ativa' : ''}`} disabled={sepRodando} onClick={() => setSepModo(id)}>
                      <strong>{nome}</strong><small>{dica}</small>
                    </button>
                  ))}
                </div>
                <label className={`cv-upload ${sepRodando ? 'cv-desab' : ''}`}>
                  <input type="file" accept="audio/*" multiple disabled={sepRodando} onChange={(e) => { adicionarNaFila(e.target.files); e.target.value = ''; }} />
                  📁 Escolher músicas (pode selecionar várias)
                </label>
                {!!sepFila.length && (
                  <p className="cv-dica">{sepFila.length} na fila · {prontas} pronta(s){pendentes ? ` · ${pendentes} esperando` : ''}</p>
                )}
              </section>

              <button className="cv-btn-grande" disabled={!pendentes || sepRodando} onClick={separarTodas}>
                {sepRodando ? <><span className="cv-spin" /> Separando... (deixe a tela aberta)</> : `✂️ Separar ${pendentes || ''} música${pendentes === 1 ? '' : 's'} ${sepModo === 'gratis' ? '(grátis)' : `(≈ R$${pendentes || 1})`}`}
              </button>

              {sepFila.map((it) => (
                <section key={it.id} className={`cv-secao ${it.status === 'pronto' ? 'cv-resultado' : ''}`}>
                  <div className="cv-cartao-topo">
                    <strong>{it.status === 'pronto' ? '✅' : it.status === 'erro' ? '❌' : it.status === 'rodando' ? '⏳' : '🕒'} {it.nome}</strong>
                    {!sepRodando && it.status !== 'rodando' && (
                      <button className="cv-btn cv-btn-perigo" onClick={() => tirarDaFila(it.id)}>Tirar</button>
                    )}
                  </div>
                  {it.status === 'aguardando' && <p className="cv-dica">Esperando na fila</p>}
                  {it.status === 'rodando' && <div className="cv-carregando"><span className="cv-spin" /> {it.msg}...</div>}
                  {it.status === 'erro' && <p className="cv-dica" style={{ color: 'var(--erro)' }}>{it.erro} (toque em Separar para tentar de novo)</p>}
                  {it.status === 'pronto' && it.resultado && <Downloads p={it.resultado} />}
                </section>
              ))}
            </>
          );
        })()}

        {/* ───────── ABA: BIBLIOTECA ───────── */}
        {aba === 'vozes' && (
          <>
            <section className="cv-secao">
              <h2>✨ Criar voz nova com IA</h2>
              <input className="cv-input" placeholder="Nome (ex: Voz Gaúcha 2)" value={novaNome} onChange={(e) => setNovaNome(e.target.value)} />
              <select className="cv-input" value={novaEstilo} onChange={(e) => setNovaEstilo(e.target.value)}>
                {ESTILOS.map((e) => <option key={e.id} value={e.id}>{e.emoji} {e.nome}</option>)}
              </select>
              <textarea className="cv-input" rows={3} placeholder="Descreva a voz (ex: voz masculina grave, rouca, calma, estilo contador de causos)" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} />
              {criando.personalizada
                ? <div className="cv-carregando"><span className="cv-spin" /> {criando.personalizada}</div>
                : <button className="cv-btn-grande" onClick={criarPersonalizada}>✨ Criar voz (≈ R$3 a R$6)</button>}
            </section>

            <section className="cv-secao">
              <h2>📤 Enviar amostra de voz</h2>
              <p className="cv-dica">Ex.: um trecho do seu Cantor Nova Frequência feito no Suno ou no ilovesong. Use de 1 a 5 minutos cantados (mínimo 30 segundos), sem muito eco. Quanto mais canto, melhor a voz. O treino leva 10-20 min.</p>
              <label className="cv-upload">
                <input type="file" accept="audio/*" onChange={(e) => setAmostraArq(e.target.files[0] || null)} />
                {amostraArq ? `✓ ${amostraArq.name}` : '📁 Escolher áudio'}
              </label>
              <input className="cv-input" placeholder="Nome da voz" value={amostraNome} onChange={(e) => setAmostraNome(e.target.value)} />
              <select className="cv-input" value={amostraEstilo} onChange={(e) => setAmostraEstilo(e.target.value)}>
                {ESTILOS.map((e) => <option key={e.id} value={e.id}>{e.emoji} {e.nome}</option>)}
              </select>
              <label className="cv-check">
                <input type="checkbox" checked={amostraTemInstrumental} onChange={(e) => setAmostraTemInstrumental(e.target.checked)} />
                O áudio tem instrumental (separar só a voz)
              </label>
              <label className="cv-check">
                <input type="checkbox" checked={confirmoVoz} onChange={(e) => setConfirmoVoz(e.target.checked)} />
                Confirmo que esta voz é minha, do meu personagem de IA ou tenho autorização para usá-la
              </label>
              {criando.amostra
                ? <div className="cv-carregando"><span className="cv-spin" /> {criando.amostra}</div>
                : <button className="cv-btn-grande" onClick={enviarAmostra}>📤 Salvar voz</button>}
            </section>

            {ESTILOS.map((e) => {
              const presets = PRESETS.filter((p) => p.estilo === e.id);
              const proprias = vozes.filter((v) => v.estilo === e.id && !v.presetId);
              return (
                <section key={e.id} className="cv-secao">
                  <h2>{e.emoji} {e.nome}</h2>
                  <div className="cv-grade">
                    {presets.map((p) => {
                      const v = vozDoPreset(p.id);
                      return <CartaoVoz key={p.id} titulo={p.nome} dica={p.dica} voz={v} criandoMsg={criando[p.id]} onCriar={() => criarPreset(p)} onApagar={v ? () => apagarVoz(v) : null} />;
                    })}
                    {proprias.map((v) => <CartaoVoz key={v.id} titulo={v.nome} descricao={v.descricao} voz={v} onApagar={() => apagarVoz(v)} />)}
                  </div>
                </section>
              );
            })}
          </>
        )}

        {/* ───────── ABA: HISTÓRICO ───────── */}
        {aba === 'historico' && (
          <section className="cv-secao">
            <h2>📜 Histórico</h2>
            {carregandoProjetos && <div className="cv-carregando"><span className="cv-spin" /> Carregando...</div>}
            {!carregandoProjetos && !projetos.length && <p className="cv-dica">Nada gerado ainda.</p>}
            {projetos.map((p) => (
              <div key={p.id} className="cv-projeto">
                <strong>{p.titulo}</strong>
                <small>{p.tipo === 'separar' ? (p.gratis ? '✂️ Só separado (grátis)' : '✂️ Só separado') : `🎤 ${p.vozNome}`} · {new Date(p.criadoEm).toLocaleString('pt-BR')}</small>
                <Downloads p={p} />
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

const CSS = `
:root { --bg:#0e1116; --card:#171b22; --card2:#1f2530; --txt:#eef1f5; --sub:#98a2b3; --pri:#7c5cff; --pri2:#9b83ff; --ok:#22c55e; --erro:#ef4444; --borda:#2a3140; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--txt); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
.cv-pagina { max-width:860px; margin:0 auto; padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(40px + env(safe-area-inset-bottom,0px)); }
.cv-topo h1 { margin:8px 0 4px; font-size:28px; }
.cv-topo p { margin:0 0 16px; color:var(--sub); }
.cv-voltar { color:var(--pri2); text-decoration:none; font-weight:600; }
.cv-abas { display:flex; gap:8px; overflow-x:auto; margin-bottom:16px; padding-bottom:4px; }
.cv-aba { flex:0 0 auto; padding:12px 16px; border-radius:12px; border:1px solid var(--borda); background:var(--card); color:var(--txt); font-size:15px; font-weight:600; cursor:pointer; }
.cv-aba-ativa { background:var(--pri); border-color:var(--pri); }
.cv-secao { background:var(--card); border:1px solid var(--borda); border-radius:16px; padding:16px; margin-bottom:14px; }
.cv-secao h2 { margin:0 0 12px; font-size:18px; display:flex; align-items:center; gap:10px; }
.cv-num { display:inline-flex; width:28px; height:28px; border-radius:50%; background:var(--pri); align-items:center; justify-content:center; font-size:15px; }
.cv-upload { display:flex; align-items:center; justify-content:center; gap:10px; padding:20px; border:2px dashed var(--borda); border-radius:14px; cursor:pointer; font-weight:600; text-align:center; margin-bottom:10px; }
.cv-upload input { display:none; }
.cv-desab { opacity:.6; pointer-events:none; }
.cv-input { width:100%; padding:14px; border-radius:12px; border:1px solid var(--borda); background:var(--card2); color:var(--txt); font-size:16px; margin-bottom:10px; font-family:inherit; }
.cv-audio { width:100%; margin:8px 0; }
.cv-chips { display:flex; flex-wrap:wrap; gap:8px; }
.cv-chip { padding:12px 14px; border-radius:999px; border:1px solid var(--borda); background:var(--card2); color:var(--txt); font-size:15px; cursor:pointer; }
.cv-chip-ativo { background:var(--pri); border-color:var(--pri); font-weight:700; }
.cv-grade { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; }
.cv-cartao { background:var(--card2); border:2px solid var(--borda); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:6px; }
.cv-sel { border-color:var(--ok); }
.cv-cartao-topo { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.cv-tag { font-size:11px; padding:3px 8px; border-radius:999px; background:#22c55e22; color:var(--ok); }
.cv-desc { margin:0; color:var(--sub); font-size:13px; }
.cv-dica { margin:6px 0 0; color:var(--sub); font-size:13px; }
.cv-centro { text-align:center; }
.cv-botoes { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
.cv-btn { padding:11px 14px; border-radius:10px; border:none; font-size:14px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
.cv-btn-pri { background:var(--pri); color:#fff; }
.cv-btn-sec { background:#2e3648; color:var(--txt); }
.cv-btn-ok { background:var(--ok); color:#06210f; }
.cv-btn-perigo { background:transparent; color:var(--erro); border:1px solid #ef444466; }
.cv-btn-grande { width:100%; padding:18px; border-radius:14px; border:none; background:linear-gradient(135deg,var(--pri),#c05cff); color:#fff; font-size:18px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; margin:6px 0 8px; }
.cv-btn-grande:disabled { opacity:.45; cursor:not-allowed; }
.cv-opcoes { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; margin-bottom:12px; }
.cv-opcao { padding:12px; border-radius:12px; border:1px solid var(--borda); background:var(--card2); color:var(--txt); text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:3px; }
.cv-opcao small { color:var(--sub); }
.cv-opcao-ativa { border-color:var(--pri); background:#7c5cff22; }
.cv-slider { display:flex; flex-direction:column; gap:8px; color:var(--sub); }
.cv-slider input { width:100%; accent-color:var(--pri); }
.cv-check { display:flex; gap:10px; align-items:flex-start; margin:8px 0; font-size:14px; }
.cv-check input { width:20px; height:20px; flex:0 0 auto; accent-color:var(--pri); }
.cv-carregando { display:flex; align-items:center; gap:10px; color:var(--pri2); font-weight:600; font-size:14px; padding:8px 0; }
.cv-spin { width:16px; height:16px; border:3px solid #ffffff33; border-top-color:#fff; border-radius:50%; display:inline-block; animation:cvgira .8s linear infinite; flex:0 0 auto; }
@keyframes cvgira { to { transform:rotate(360deg); } }
.cv-progresso { background:var(--card); border:1px solid var(--borda); border-radius:16px; padding:16px; margin:10px 0; }
.cv-passo { display:flex; gap:12px; align-items:center; padding:8px 0; color:var(--sub); }
.cv-passo small { display:block; color:var(--pri2); }
.cv-bola { width:32px; height:32px; border-radius:50%; background:var(--card2); display:flex; align-items:center; justify-content:center; font-weight:700; flex:0 0 auto; }
.cv-atual { color:var(--txt); }
.cv-atual .cv-bola { background:var(--pri); }
.cv-feito { color:var(--txt); }
.cv-feito .cv-bola { background:var(--ok); color:#06210f; }
.cv-aviso { position:sticky; top:calc(8px + env(safe-area-inset-top,0px)); z-index:5; background:#14532d; border:1px solid var(--ok); padding:12px 14px; border-radius:12px; margin-bottom:12px; font-weight:600; }
.cv-aviso-erro { background:#450a0a; border-color:var(--erro); position:static; }
.cv-downloads { display:flex; flex-direction:column; gap:12px; }
.cv-down-item { background:var(--card2); border-radius:12px; padding:12px; }
.cv-projeto { border-top:1px solid var(--borda); padding:14px 0; display:flex; flex-direction:column; gap:6px; }
.cv-projeto small { color:var(--sub); }
.cv-resultado { border-color:var(--ok); }
`;
