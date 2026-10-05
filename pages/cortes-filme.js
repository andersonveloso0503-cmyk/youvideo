import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';

// Cortes de Filme — cenas bíblicas curtas com cara de trecho de filme (imagem realista,
// diálogo entre os personagens, corte rápido), para o canal Em Nome de Jesus.
// Tudo é gerado do zero pelo painel: roteiro, vozes e imagens. Não usa trecho de
// filme ou série pronto, então o vídeo é do canal e pode monetizar.

const CENAS = [
  {
    nome: 'Pedro anda sobre as águas',
    tema:
      'Mateus 14. De madrugada, no meio do mar agitado, os discípulos veem Jesus andando sobre as águas e se apavoram. Pedro pede para ir até ele, desce do barco, anda, olha para o vento, começa a afundar e grita por socorro. Jesus estende a mão e o segura.',
  },
  {
    nome: 'A mulher acusada e as pedras no chão',
    tema:
      'João 8. No pátio do templo, um grupo de homens traz uma mulher acusada e exige de Jesus uma sentença. Ele se abaixa e escreve no chão, em silêncio. Depois responde que quem nunca pecou atire a primeira pedra. Um a um, eles vão embora, e Jesus fala com a mulher.',
  },
  {
    nome: 'Lázaro, vem para fora',
    tema:
      'João 11. Jesus chega a Betânia quatro dias depois da morte de Lázaro. Marta diz que, se ele estivesse ali, o irmão não teria morrido. Jesus chora, pede que tirem a pedra do túmulo, ora e chama Lázaro pelo nome. Lázaro sai, ainda enrolado em faixas.',
  },
  {
    nome: 'A tempestade no barco',
    tema:
      'Marcos 4. À noite, uma tempestade enche o barco de água enquanto Jesus dorme na popa. Os discípulos, desesperados, o acordam perguntando se ele não se importa que morram. Jesus se levanta, manda o vento e o mar se calarem, e tudo fica em silêncio.',
  },
  {
    nome: 'Zaqueu desce da árvore',
    tema:
      'Lucas 19. Em Jericó, Zaqueu, cobrador de impostos rico e desprezado, sobe numa árvore para ver Jesus passar. Jesus para, olha para cima, chama Zaqueu pelo nome e diz que vai ficar na casa dele. A multidão reclama, e Zaqueu decide devolver o que tirou dos outros.',
  },
  {
    nome: 'O pai corre para o filho que voltou',
    tema:
      'Lucas 15. O filho mais novo, que gastou tudo longe de casa, volta sujo e com fome, ensaiando um pedido de perdão. O pai o vê de longe, corre, abraça e não o deixa terminar a frase: manda trazer roupa, anel e fazer festa, porque o filho estava perdido e foi achado.',
  },
  {
    nome: 'Davi diante do gigante',
    tema:
      '1 Samuel 17. No vale, o gigante Golias desafia Israel há quarenta dias e ninguém responde. O jovem pastor Davi se apresenta. Golias ri dele. Davi responde que vem em nome do Senhor. A cena termina no instante em que Davi corre na direção do gigante e o exército prende a respiração.',
  },
  {
    nome: 'Daniel na cova dos leões',
    tema:
      'Daniel 6. Daniel é lançado na cova dos leões por continuar orando. O rei passa a noite sem dormir. Ao amanhecer, corre até a cova e chama por Daniel com a voz embargada. Lá de dentro, Daniel responde que Deus fechou a boca dos leões.',
  },
  {
    nome: 'Moisés diante do mar',
    tema:
      'Êxodo 14. O povo de Israel está encurralado entre o mar e o exército do Faraó que se aproxima. O povo entra em pânico e acusa Moisés. Moisés diz para não temerem, ergue o cajado, e um vento forte abre um caminho seco no meio do mar.',
  },
  {
    nome: 'A mulher samaritana no poço',
    tema:
      'João 4. Ao meio-dia, sozinha, uma mulher samaritana vai buscar água e encontra Jesus sentado junto ao poço. Ele pede água, ela estranha. Ele fala de uma água que mata a sede para sempre e mostra que conhece a vida dela. Ela larga o cântaro e corre para a cidade.',
  },
  {
    nome: 'Bartimeu grita no meio da multidão',
    tema:
      'Marcos 10. Na saída de Jericó, o cego Bartimeu, sentado à beira do caminho, ouve que Jesus está passando e começa a gritar. A multidão manda ele se calar, e ele grita mais alto. Jesus para e manda chamá-lo. Pergunta o que ele quer. Bartimeu pede para ver, e passa a enxergar.',
  },
  {
    nome: 'A mulher que tocou no manto',
    tema:
      'Marcos 5. No meio de uma multidão que aperta Jesus, uma mulher doente há doze anos se arrasta até tocar na barra do manto dele e é curada na hora. Jesus para e pergunta quem o tocou. Os discípulos estranham a pergunta. Ela se apresenta tremendo, e Jesus a chama de filha.',
  },
  {
    nome: 'Pedro e o canto do galo',
    tema:
      'Lucas 22. De noite, no pátio, junto a uma fogueira, Pedro é reconhecido três vezes como alguém que andava com Jesus e nega as três. O galo canta. Jesus, sendo levado, se vira e olha para Pedro. Pedro sai e chora amargamente.',
  },
  {
    nome: 'Os três amigos e a fornalha',
    tema:
      'Daniel 3. O rei Nabucodonosor ameaça três jovens que se recusam a se curvar diante da estátua. Eles respondem que Deus pode livrá-los e que, mesmo que não livre, não vão se curvar. Depois, o rei olha para a fornalha e, espantado, conta quatro homens andando no meio do fogo.',
  },
  {
    nome: 'Tomé vê e acredita',
    tema:
      'João 20. Tomé diz aos outros discípulos que só acredita se vir com os próprios olhos. Oito dias depois, com as portas fechadas, Jesus aparece no meio deles, deseja paz e chama Tomé para perto. Tomé cai de joelhos e responde: meu Senhor e meu Deus.',
  },
];

const TONS = [
  ['emocionante', 'Emocionante (aperta o coração)'],
  ['tenso', 'Tenso (suspense até o fim)'],
  ['esperanca', 'Esperança e vitória'],
  ['confronto', 'Confronto (frente a frente)'],
];

const chaveDe = (nome) => (nome || 'narrador').trim().toLowerCase();
const generoDaVoz = (v) => (/female|femin|mulher/i.test(v.genero || '') ? 'mulher' : /male|mascul|homem/i.test(v.genero || '') ? 'homem' : '');

export default function CortesFilme() {
  const estilo = 'realista'; // imagem com cara de filme (fotografia de cinema), não desenho
  const formato = 'short';

  const [cenaEscolhida, setCenaEscolhida] = useState(CENAS[0].nome);
  const [temaCustom, setTemaCustom] = useState('');
  const [usarCustom, setUsarCustom] = useState(false);
  const tema = usarCustom ? temaCustom : (CENAS.find((h) => h.nome === cenaEscolhida)?.tema || '');

  const [duracaoDesejada, setDuracaoDesejada] = useState('45');
  const [tom, setTom] = useState('emocionante');
  const [modeloVoz, setModeloVoz] = useState('eleven');
  const [serieId, setSerieId] = useState('');
  const [series, setSeries] = useState([]);
  const [vozesConta, setVozesConta] = useState([]);
  const [vozEscolhida, setVozEscolhida] = useState({}); // personagem (minúsculo) -> id da voz escolhida à mão

  useEffect(() => {
    fetch('/api/serie-listar')
      .then((r) => r.json())
      .then((data) => setSeries(data.series || []))
      .catch(() => setSeries([]));
    fetch('/api/list-voices')
      .then((r) => r.json())
      .then((data) => setVozesConta(data.vozes || []))
      .catch(() => setVozesConta([]));
  }, []);

  const [status, setStatus] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);

  // Quem fala no roteiro, na ordem em que aparece
  const cenasRoteiro = results.script?.cenas;
  const personagens = useMemo(() => {
    const vistos = new Map();
    for (const c of cenasRoteiro || []) {
      const ch = chaveDe(c.personagem);
      if (!vistos.has(ch)) vistos.set(ch, { chave: ch, nome: (c.personagem || 'Narrador').trim() || 'Narrador', sexo: c.sexo === 'mulher' ? 'mulher' : 'homem' });
    }
    return [...vistos.values()];
  }, [cenasRoteiro]);

  // Sugestão de voz por personagem: homem com voz de homem, mulher com voz de mulher,
  // sem repetir enquanto houver voz sobrando. O Narrador fica com a voz padrão do canal.
  const vozSugerida = useMemo(() => {
    const mapa = {};
    const usadas = new Set();
    for (const p of personagens) {
      if (p.chave === 'narrador') continue;
      const doSexo = vozesConta.filter((v) => generoDaVoz(v) === p.sexo);
      const lista = doSexo.length ? doSexo : vozesConta;
      const livre = lista.find((v) => !usadas.has(v.id)) || lista[0];
      if (livre) {
        mapa[p.chave] = livre.id;
        usadas.add(livre.id);
      }
    }
    return mapa;
  }, [personagens, vozesConta]);

  const vozDe = (chave) => (vozEscolhida[chave] !== undefined ? vozEscolhida[chave] : vozSugerida[chave] || '');

  async function runStep(key, endpoint, body) {
    setLoading(key);
    setStatus((s) => ({ ...s, [key]: null }));
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na etapa');
      setResults((r) => ({ ...r, [key]: data }));
      setStatus((s) => ({ ...s, [key]: 'ok' }));
      return data;
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: 'error' }));
      setResults((r) => ({ ...r, [key]: { error: err.message } }));
      return null;
    } finally {
      setLoading(null);
    }
  }

  const generateScript = () =>
    runStep('script', '/api/generate-script-filme', { tema, formato, duracaoDesejada, tom });

  const generateVoice = async () => {
    const cenas = results.script?.cenas || [];
    const falas = cenas.map((c) => ({ personagem: c.personagem, texto: c.textoNarrado, vozTipo: c.vozTipo }));
    const vozes = {};
    for (const p of personagens) {
      const id = vozDe(p.chave);
      if (id) vozes[p.chave] = id;
    }

    const voiceData = await runStep('voice', '/api/generate-voice-dialogo', {
      falas,
      vozes,
      modelo: modeloVoz === 'flash' ? 'flash' : undefined,
    });
    if (!voiceData) return;

    // Cola o tempo exato de cada fala na cena correspondente, na mesma ordem:
    // é isso que faz a imagem de cada cena entrar e sair junto com quem fala.
    const cenasComTempo = voiceData.cenasComTempo || [];
    setResults((r) => {
      const cenasAtualizadas = (r.script?.cenas || []).map((c, i) => ({
        ...c,
        start: cenasComTempo[i]?.start,
        length: cenasComTempo[i]?.length,
      }));
      return { ...r, script: { ...r.script, cenas: cenasAtualizadas } };
    });
  };

  const imagemReferenciaUrl = series.find((s) => s.id === serieId)?.imagemReferenciaUrl;

  const generateVisual = () =>
    runStep('visual', '/api/generate-visual', {
      cenas: results.script?.cenas || [],
      estilo,
      formato,
      imagemReferenciaUrl,
    });

  // Anima todas as cenas em "loop" (o clipe termina no mesmo quadro em que começa),
  // então a montagem repete o movimento pelo tempo todo da fala, sem imagem parada.
  const animateScenes = async () => {
    const primeiro = await runStep('visual', '/api/animate-scenes', {
      arquivos: results.visual?.arquivos || [],
      formato,
      loop: true,
    });
    if (!primeiro) return;

    const pendentes = (primeiro.arquivos || []).filter((a) => a.klingTaskId);
    if (!pendentes.length) return;

    setLoading('visual');
    let tentativas = 0;
    while (tentativas < 90) {
      await new Promise((r) => setTimeout(r, 5000));
      let todasProntas = true;

      for (const arquivo of pendentes) {
        if (arquivo.videoUrl || arquivo.falhouAnimacao) continue;
        try {
          const check = await fetch(
            `/api/check-kling-status?statusUrl=${encodeURIComponent(arquivo.statusUrl)}&responseUrl=${encodeURIComponent(arquivo.responseUrl)}`
          ).then((r) => r.json());
          if (check.status === 'done') {
            arquivo.videoUrl = check.videoUrl;
          } else if (check.status === 'failed') {
            arquivo.falhouAnimacao = true;
            arquivo.avisoVideo = check.error;
          } else {
            todasProntas = false;
          }
        } catch {
          todasProntas = false; // queda de internet no meio: tenta de novo na próxima volta
        }
      }

      setResults((r) => ({ ...r, visual: { arquivos: [...primeiro.arquivos] } }));
      if (todasProntas) break;
      tentativas++;
    }
    setLoading(null);
  };

  const assembleVideo = async () => {
    const primeira = await runStep('assemble', '/api/assemble-video', {
      audioSegments: results.voice?.audioSegments,
      titulo: results.script?.titulo,
      cenas: results.visual?.arquivos,
      formato,
      palavras: results.voice?.palavras,
      marca: 'Em Nome de Jesus',
    });
    if (!primeira || !primeira.renderId) return;

    setLoading('assemble');
    let tentativas = 0;
    while (tentativas < (String(primeira.renderId).startsWith('pc:') ? 1440 : 40)) {
      await new Promise((r) => setTimeout(r, 5000));
      let check;
      try {
        check = await fetch(`/api/assemble-video?id=${primeira.renderId}`).then((r) => r.json());
      } catch {
        tentativas++;
        continue;
      }
      if (check.status === 'done') {
        setResults((r) => ({ ...r, assemble: { ...primeira, ...check } }));
        setStatus((s) => ({ ...s, assemble: 'ok' }));
        break;
      }
      if (check.status === 'failed') {
        setResults((r) => ({ ...r, assemble: { error: `A montagem falhou: ${check.erro || 'motivo não informado'}` } }));
        setStatus((s) => ({ ...s, assemble: 'error' }));
        break;
      }
      setResults((r) => ({ ...r, assemble: { ...primeira, status: check.status } }));
      tentativas++;
    }
    setLoading(null);
  };

  const generateThumbnail = () =>
    runStep('thumbnail', '/api/generate-thumbnail', {
      tema,
      titulo: results.script?.titulo,
      estilo,
      thumbnailTitulo: results.script?.thumbnailTitulo,
      thumbnailSubtitulo: results.script?.thumbnailSubtitulo,
      imagemReferenciaUrl,
    });

  const publish = () =>
    runStep('publish', '/api/youtube-upload', {
      videoUrl: results.assemble?.videoUrl,
      thumbnailUrl: results.thumbnail?.imageUrl,
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
      tags: results.script?.tags,
    });

  const salvarProjeto = () =>
    runStep('salvar', '/api/save-project', {
      origem: 'cortes-filme',
      tema,
      estilo,
      formato,
      titulo: results.script?.titulo,
      descricao: results.script?.descricao,
      videoUrl: results.assemble?.videoUrl,
      thumbnailUrl: results.thumbnail?.imageUrl,
      audioUrl: results.voice?.audioUrl,
      audioSegments: results.voice?.audioSegments,
      cenas: results.visual?.arquivos,
      palavras: results.voice?.palavras,
    });

  const temImagemSemAnimar = (results.visual?.arquivos || []).some((a) => a.imageUrl && !a.klingTaskId && !a.videoUrl);
  const qtdParaAnimar = (results.visual?.arquivos || []).filter((a) => a.imageUrl).length;

  return (
    <div className="container">
      <Head><title>Cortes de Filme · Youvideo</title></Head>
      <h1>Cortes de Filme Bíblicos</h1>
      <p className="subtitle">
        Cenas curtas com cara de trecho de filme: imagem realista, personagens falando entre si e corte rápido,
        em formato Short, para o canal Em Nome de Jesus.
      </p>
      <p style={{ marginTop: -8 }}>
        <a href="/" style={{ color: 'var(--gold)', fontSize: 13 }}>← voltar pro painel principal</a>
      </p>

      <div className="card">
        <h2>Escolha a cena</h2>
        <label>Cena</label>
        <select
          value={usarCustom ? '__custom__' : cenaEscolhida}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setUsarCustom(true);
            } else {
              setUsarCustom(false);
              setCenaEscolhida(e.target.value);
            }
          }}
        >
          {CENAS.map((h) => (
            <option key={h.nome} value={h.nome}>{h.nome}</option>
          ))}
          <option value="__custom__">Outra cena (digitar)</option>
        </select>

        {usarCustom ? (
          <>
            <label>Descreva a cena (quem está, o que acontece e onde está na Bíblia)</label>
            <textarea
              placeholder="Ex: Atos 9. Saulo cai no caminho de Damasco, cercado por uma luz forte, e ouve uma voz perguntando por que ele o persegue."
              value={temaCustom}
              onChange={(e) => setTemaCustom(e.target.value)}
            />
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>{tema}</div>
        )}

        <div className="row" style={{ marginTop: 4 }}>
          <div>
            <label>Tom da cena</label>
            <select value={tom} onChange={(e) => setTom(e.target.value)}>
              {TONS.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </div>
          <div>
            <label>Duração desejada</label>
            <select value={duracaoDesejada} onChange={(e) => setDuracaoDesejada(e.target.value)}>
              <option value="30">Até 30 segundos</option>
              <option value="45">Até 45 segundos</option>
              <option value="60">Até 1 minuto</option>
            </select>
          </div>
        </div>

        <label>Série (rosto fixo do personagem, opcional)</label>
        <select value={serieId} onChange={(e) => setSerieId(e.target.value)}>
          <option value="">Nenhuma (personagens novos a cada vídeo)</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        {serieId && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Com série, o rosto dela entra em TODAS as cenas. Use quando a cena é centrada em um personagem só.
          </div>
        )}

        <label>Modelo de voz</label>
        <select value={modeloVoz} onChange={(e) => setModeloVoz(e.target.value)}>
          <option value="eleven">Eleven (mais expressivo, 1 crédito/caractere)</option>
          <option value="flash">Flash (mais econômico, 0,5 crédito/caractere — rende o dobro)</option>
        </select>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
          Visual travado em <b>filme realista</b> e formato travado em <b>Short</b> nessa tela. Roteiro, vozes e imagens são
          criados do zero aqui, então o vídeo é seu. Não misture trechos de filmes ou séries prontos: eles têm dono e
          derrubam a monetização.
        </div>
      </div>

      <StepCard
        n={1}
        title="Roteiro da cena (falas, título, descrição, tags)"
        status={status.script}
        loading={loading === 'script'}
        disabled={!tema.trim()}
        onRun={generateScript}
        result={results.script}
        renderResult={(r) => (
          <ScriptResult
            result={r}
            onFalaChange={(indice, campo, valor) =>
              setResults((res) => {
                const cenas = [...(res.script?.cenas || [])];
                cenas[indice] = { ...cenas[indice], [campo]: valor };
                return { ...res, script: { ...res.script, cenas } };
              })
            }
          />
        )}
      />

      <StepCard
        n={2}
        title="Vozes (uma por personagem)"
        status={status.voice}
        loading={loading === 'voice'}
        disabled={!results.script?.cenas?.length}
        onRun={generateVoice}
        result={results.voice}
        antes={
          personagens.length > 0 && vozesConta.length > 0 ? (
            <EscolherVozes
              personagens={personagens}
              vozes={vozesConta}
              vozDe={vozDe}
              onChange={(chave, id) => setVozEscolhida((v) => ({ ...v, [chave]: id }))}
            />
          ) : null
        }
        renderResult={(r) => <VoiceResult result={r} />}
      />

      <StepCard
        n={3}
        title="Imagens das cenas"
        status={status.visual}
        loading={loading === 'visual'}
        disabled={!results.voice?.audioSegments?.length}
        onRun={generateVisual}
        result={results.visual}
        renderResult={(r) => (
          <>
            <VisualResult
              result={r}
              estilo={estilo}
              formato={formato}
              imagemReferenciaUrl={imagemReferenciaUrl}
              onRetryCena={(indice, novoArquivo) =>
                setResults((res) => {
                  const arquivos = [...(res.visual?.arquivos || [])];
                  arquivos[indice] = novoArquivo;
                  return { ...res, visual: { ...res.visual, arquivos } };
                })
              }
            />
            {temImagemSemAnimar && (
              <>
                <button onClick={animateScenes} disabled={loading === 'visual'}>
                  {loading === 'visual' && <span className="spinner" />}
                  {loading === 'visual' ? 'Animando...' : `Animar as ${qtdParaAnimar} cenas (gasta crédito da fal.ai)`}
                </button>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Animado fica com muito mais cara de filme. Sem animar, cada cena sai com a imagem parada e um zoom lento,
                  e não gasta crédito de vídeo.
                </div>
              </>
            )}
          </>
        )}
      />

      <StepCard
        n={4}
        title="Montagem final"
        status={status.assemble}
        loading={loading === 'assemble'}
        disabled={!results.voice?.audioSegments?.length || !results.visual?.arquivos?.length}
        onRun={assembleVideo}
        result={results.assemble}
        renderResult={(r) => <AssembleResult result={r} />}
      />

      <StepCard
        n={5}
        title="Thumbnail"
        status={status.thumbnail}
        loading={loading === 'thumbnail'}
        disabled={!results.script?.titulo}
        onRun={generateThumbnail}
        result={results.thumbnail}
        renderResult={(r) => <ThumbnailResult result={r} />}
      />

      <StepCard
        n={6}
        title="Publicar no YouTube"
        status={status.publish}
        loading={loading === 'publish'}
        disabled={!results.assemble?.videoUrl}
        onRun={publish}
        result={results.publish}
      />

      <div className="card">
        <h2>Salvar este projeto</h2>
        <button disabled={!results.script?.titulo || loading === 'salvar'} onClick={salvarProjeto}>
          {loading === 'salvar' && <span className="spinner" />}
          {loading === 'salvar' ? 'Salvando...' : 'Salvar projeto'}
        </button>
        {status.salvar === 'ok' && <div className="result-box">Salvo! Aparece em "Meus Projetos" e na Biblioteca do Compilador, na pasta Cortes.</div>}
        {status.salvar === 'error' && <div className="result-box">Erro: {results.salvar?.error}</div>}
      </div>
    </div>
  );
}

function StepCard({ n, title, status, loading, disabled, onRun, result, renderResult, antes }) {
  return (
    <div className="card">
      <h2>
        <span className={`step-badge ${status === 'ok' ? 'done' : ''}`}>{n}</span>
        {title}
        {status && (
          <span className={`status ${status}`}>
            {status === 'ok' ? 'pronto' : 'erro'}
          </span>
        )}
      </h2>
      {antes}
      <button disabled={disabled || loading} onClick={onRun}>
        {loading && <span className="spinner" />}
        {loading ? 'Gerando...' : status === 'ok' ? 'Gerar de novo' : 'Executar etapa'}
      </button>
      {result && result.error && (
        <div className="result-box">Erro: {result.error}</div>
      )}
      {result && !result.error && renderResult && renderResult(result)}
      {result && !result.error && !renderResult && (
        <div className="result-box">{JSON.stringify(result, null, 2)}</div>
      )}
    </div>
  );
}

// Voz de cada personagem: já vem sugerida (homem com voz de homem, mulher com voz de mulher)
// e dá para trocar e ouvir a amostra antes de gastar crédito.
function EscolherVozes({ personagens, vozes, vozDe, onChange }) {
  const ouvir = (id) => {
    const v = vozes.find((x) => x.id === id);
    if (v?.preview) new Audio(v.preview).play().catch(() => {});
  };
  return (
    <div className="result-box" style={{ whiteSpace: 'normal', marginTop: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Confira a voz de cada um antes de gerar. Se trocar depois, é só gerar as vozes de novo.
      </div>
      {personagens.map((p) => {
        const id = vozDe(p.chave);
        const temAmostra = !!vozes.find((x) => x.id === id)?.preview;
        return (
          <div key={p.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ minWidth: 110 }}>{p.nome}</b>
            <select value={id} onChange={(e) => onChange(p.chave, e.target.value)} style={{ flex: 1, minWidth: 180 }}>
              <option value="">{p.chave === 'narrador' ? 'Voz padrão do canal' : 'Escolha automática'}</option>
              {vozes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}{generoDaVoz(v) ? ` (${generoDaVoz(v)})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={{ marginTop: 0, padding: '6px 12px', fontSize: 12 }}
              disabled={!temAmostra}
              onClick={() => ouvir(id)}
            >
              ▶ Ouvir
            </button>
          </div>
        );
      })}
    </div>
  );
}

async function baixarArquivo(url, nomeArquivo) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    alert('Não deu pra baixar automaticamente. Segure o dedo em cima do vídeo/imagem e escolha "Salvar" no menu que aparecer.');
  }
}

function AssembleResult({ result }) {
  if (!result.videoUrl) {
    return (
      <div className="result-box">
        {result.status && result.status !== 'processing' ? result.status : result.aviso || 'processando...'}
      </div>
    );
  }
  return (
    <div className="result-box">
      <video src={result.videoUrl} controls style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
      <div style={{ marginTop: 10 }}>
        <button style={{ marginTop: 0 }} onClick={() => baixarArquivo(result.videoUrl, 'corte-de-filme.mp4')}>
          Baixar vídeo completo
        </button>
      </div>
    </div>
  );
}

function VisualResult({ result, onRetryCena, estilo, formato, imagemReferenciaUrl }) {
  const [textoEdit, setTextoEdit] = useState({});
  const [tentandoIndice, setTentandoIndice] = useState(null);

  const tentarDeNovo = async (indice, arquivoOriginal) => {
    setTentandoIndice(indice);
    try {
      const res = await fetch('/api/generate-visual-cena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: textoEdit[indice] ?? arquivoOriginal.cena,
          textoNarrado: arquivoOriginal.textoNarrado,
          estilo,
          formato,
          imagemReferenciaUrl,
          start: arquivoOriginal.start,
          length: arquivoOriginal.length,
        }),
      });
      const novoArquivo = await res.json();
      if (!res.ok) throw new Error(novoArquivo.error || 'Erro ao tentar de novo');
      onRetryCena && onRetryCena(indice, novoArquivo);
    } catch (err) {
      onRetryCena && onRetryCena(indice, { ...arquivoOriginal, cena: textoEdit[indice] ?? arquivoOriginal.cena, erro: err.message });
    } finally {
      setTentandoIndice(null);
    }
  };

  return (
    <div className="result-box" style={{ whiteSpace: 'normal' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {(result.arquivos || []).map((a, i) => (
          <div key={i} style={{ width: 150 }}>
            {a.videoUrl ? (
              <video src={a.videoUrl} controls style={{ width: '100%', borderRadius: 6 }} />
            ) : a.imageUrl ? (
              <img src={a.imageUrl} alt={a.cena} style={{ width: '100%', borderRadius: 6 }} />
            ) : a.erro ? (
              <div style={{ color: '#ff9d8c', fontSize: 11 }}>
                {a.erro}
                <textarea
                  value={textoEdit[i] ?? a.cena ?? ''}
                  onChange={(e) => setTextoEdit((t) => ({ ...t, [i]: e.target.value }))}
                  style={{ width: '100%', minHeight: 60, fontSize: 11, marginTop: 6, fontFamily: 'inherit' }}
                />
                <button
                  style={{ marginTop: 4, fontSize: 11, padding: '4px 8px' }}
                  disabled={tentandoIndice === i}
                  onClick={() => tentarDeNovo(i, a)}
                >
                  {tentandoIndice === i && <span className="spinner" />}
                  {tentandoIndice === i ? 'Gerando...' : 'Tentar de novo'}
                </button>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>{a.status || 'sem imagem'}</div>
            )}
            {a.klingTaskId && !a.videoUrl && !a.falhouAnimacao && (
              <div style={{ fontSize: 11, color: 'var(--gold)' }}>animando...</div>
            )}
            {a.avisoVideo && (
              <div style={{ fontSize: 11, color: '#ff9d8c' }}>{a.avisoVideo}</div>
            )}
            {!a.erro && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{a.cena}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThumbnailResult({ result }) {
  return (
    <div className="result-box">
      {result.imageUrl ? (
        <>
          <img src={result.imageUrl} alt="thumbnail" style={{ width: '100%', maxWidth: 400, borderRadius: 6 }} />
          <div style={{ marginTop: 10 }}>
            <button style={{ marginTop: 0 }} onClick={() => baixarArquivo(result.imageUrl, 'thumbnail.png')}>
              Baixar thumbnail
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--text-muted)' }}>{result.status || 'sem imagem'}</div>
      )}
    </div>
  );
}

function VoiceResult({ result }) {
  if (!result.audioSegments?.length) return <div className="result-box">{result.status || 'processando...'}</div>;
  const total = Math.max(...result.audioSegments.map((s) => (s.start || 0) + (s.length || 0)));
  return (
    <div className="result-box" style={{ whiteSpace: 'normal' }}>
      {result.audioSegments.map((seg, i) => (
        <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 4 }}>
            <b>{seg.personagem}</b>
          </div>
          <audio src={seg.url} controls style={{ width: '100%' }} />
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        {result.audioSegments.length} falas · cerca de {Math.round(total)} segundos no total
      </div>
    </div>
  );
}

function ScriptResult({ result, onFalaChange }) {
  return (
    <div className="result-box" style={{ whiteSpace: 'normal' }}>
      <p><b>Título:</b> {result.titulo}</p>
      {result.referencia && <p><b>Na Bíblia:</b> {result.referencia}</p>}
      <p style={{ whiteSpace: 'pre-wrap' }}><b>Descrição:</b> {result.descricao}</p>
      <p><b>Tags:</b> {(result.tags || []).join(', ')}</p>
      <p>
        <b>Falas ({(result.cenas || []).length})</b>{' '}
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          (confira com a Bíblia e edite quem fala, o texto e a descrição da imagem antes de gerar as vozes)
        </span>
      </p>
      <ol>
        {(result.cenas || []).map((c, i) => (
          <li key={i} style={{ marginBottom: 14 }}>
            <div className="row" style={{ marginBottom: 4 }}>
              <div>
                <input
                  type="text"
                  value={c.personagem || ''}
                  onChange={(e) => onFalaChange && onFalaChange(i, 'personagem', e.target.value)}
                  placeholder="Quem fala (ex: Narrador, Pedro...)"
                  style={{ fontWeight: 600 }}
                />
              </div>
              <div>
                <select
                  value={c.vozTipo === 'grave' ? 'grave' : 'normal'}
                  onChange={(e) => onFalaChange && onFalaChange(i, 'vozTipo', e.target.value)}
                >
                  <option value="normal">Voz normal</option>
                  <option value="grave">Voz grave (imponente)</option>
                </select>
              </div>
            </div>
            <textarea
              value={c.textoNarrado || ''}
              onChange={(e) => onFalaChange && onFalaChange(i, 'textoNarrado', e.target.value)}
              placeholder="O que essa pessoa fala"
              style={{ width: '100%', minHeight: 50, fontFamily: 'inherit', fontSize: 'inherit' }}
            />
            <textarea
              value={c.descricao || ''}
              onChange={(e) => onFalaChange && onFalaChange(i, 'descricao', e.target.value)}
              placeholder="Descrição da imagem dessa cena"
              style={{ width: '100%', minHeight: 40, fontFamily: 'inherit', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
