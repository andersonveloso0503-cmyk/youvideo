import { useEffect, useState } from 'react';

const LISTA_INICIAL = [
  // Série de apóstolos e figuras do Novo Testamento
  'Paulo: de perseguidor a apóstolo',
  'Pedro: a negação e a redenção',
  'Estêvão, o primeiro mártir',
  'Marcos e o evangelho da ação',
  'Lucas, o médico que virou historiador da fé',
  'Timóteo, o discípulo mais jovem',
  'Tito e a liderança pela graça',
  'João, o apóstolo do amor',
  'Silas, o companheiro fiel de Paulo',
  'Apolo, o pregador eloquente',
  'Priscila e Áquila, o casal que ensinava a igreja',
  'Lídia, a primeira convertida na Europa',
  'Febe, a diaconisa que carregou a carta de Paulo',
  'Onésimo, o escravo que virou irmão',
  'Junia, uma mulher entre os apóstolos',
  'Filipe, o evangelista dos gentios',
  'Tiago, filho de Zebedeu, o primeiro apóstolo mártir',
  // Histórias do Antigo Testamento com forte apelo popular
  'A Arca de Noé e o dilúvio',
  'Davi e Golias',
  'Moisés e a travessia do Mar Vermelho',
  'Daniel na cova dos leões',
  'Jonas e o grande peixe',
  'Sansão e Dalila',
  'Os Dez Mandamentos',
  'A história de Jó e o sofrimento',
  'Ester, a rainha que salvou seu povo',
  'Rute, a lealdade que mudou uma família',
  'José e seus irmãos, do poço ao trono do Egito',
  'A Torre de Babel',
  'Abraão e o sacrifício de Isaque',
  'Elias contra os profetas de Baal',
  'Sansão e a força perdida',
  'Gideão e o exército de 300',
  // Novo Testamento, vida de Jesus
  'O nascimento de Jesus em Belém',
  'A Última Ceia',
  'Tomé, o apóstolo que duvidou',
  'O Bom Samaritano',
  'O Filho Pródigo',
  'A multiplicação dos pães e peixes',
];

export default function Temas() {
  const [temas, setTemas] = useState(null);
  const [novoTema, setNovoTema] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    const data = await fetch('/api/temas-listar').then((r) => r.json());
    setTemas(data.temas || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionarListaInicial() {
    setEnviando(true);
    await fetch('/api/temas-adicionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temas: LISTA_INICIAL }),
    });
    setEnviando(false);
    carregar();
  }

  async function adicionarTema() {
    if (!novoTema) return;
    setEnviando(true);
    await fetch('/api/temas-adicionar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temas: [novoTema] }),
    });
    setNovoTema('');
    setEnviando(false);
    carregar();
  }

  const pendentes = temas?.filter((t) => !t.usado) || [];
  const usados = temas?.filter((t) => t.usado) || [];

  return (
    <div className="container">
      <h1>Temas da Fila Automática</h1>
      <p className="subtitle">
        <a href="/" style={{ color: '#4f7cff' }}>← painel</a> ·{' '}
        <a href="/agendar" style={{ color: '#4f7cff' }}>Agendar Vídeos</a> ·{' '}
        <a href="/projetos" style={{ color: '#4f7cff' }}>Meus Projetos</a>
      </p>

      {temas && temas.length === 0 && (
        <div className="card">
          <h2>Começar com a lista sugerida</h2>
          <p style={{ fontSize: 13, color: '#aaa' }}>
            {LISTA_INICIAL.length} temas bíblicos (sua série de apóstolos + histórias populares do Antigo Testamento).
          </p>
          <button disabled={enviando} onClick={adicionarListaInicial}>
            {enviando ? 'Adicionando...' : 'Adicionar lista inicial'}
          </button>
        </div>
      )}

      <div className="card">
        <h2>Adicionar um tema</h2>
        <div className="row">
          <div>
            <input
              type="text"
              value={novoTema}
              onChange={(e) => setNovoTema(e.target.value)}
              placeholder="Ex: A conversão de Zaqueu"
            />
          </div>
        </div>
        <button disabled={!novoTema || enviando} onClick={adicionarTema}>
          Adicionar
        </button>
      </div>

      <div className="card">
        <h2>Pendentes ({pendentes.length})</h2>
        {pendentes.length === 0 && <div style={{ color: '#999' }}>Nenhum tema pendente.</div>}
        {pendentes.map((t) => (
          <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid #262a33' }}>
            {t.tema}
          </div>
        ))}
      </div>

      {usados.length > 0 && (
        <div className="card">
          <h2>Já usados ({usados.length})</h2>
          {usados.map((t) => (
            <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid #262a33', color: '#999' }}>
              {t.tema}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
