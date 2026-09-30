const { contextBridge, ipcRenderer, webUtils } = require('electron');

const chamar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld('api', {
  config: { ler: chamar('config:ler'), salvar: chamar('config:salvar'), salvarProjeto: chamar('config:salvarProjeto') },
  sistema: { info: chamar('sistema:info') },
  sync: { enviar: chamar('sync:enviar'), puxar: chamar('sync:puxar') },
  dialogo: {
    musicas: chamar('dialogo:musicas'),
    pastaMusicas: chamar('dialogo:pastaMusicas'),
    fundos: chamar('dialogo:fundos'),
    pastaSaida: chamar('dialogo:pastaSaida'),
  },
  midia: { analisar: chamar('midia:analisar'), musicas: chamar('midia:musicas'), checarFundos: chamar('midia:checarFundos'), salvarImagem: chamar('midia:salvarImagem') },
  app: { verificarAtualizacao: chamar('app:verificarAtualizacao'), atualizar: chamar('app:atualizar') },
  abrir: { pasta: chamar('abrir:pasta'), link: chamar('abrir:link') },
  botao: { existe: chamar('botao:existe'), salvar: chamar('botao:salvar') },
  criar: { abrir: chamar('criar:abrir'), limites: chamar('criar:limites'), visivel: chamar('criar:visivel'), acao: chamar('criar:acao') },
  central: {
    biblioteca: chamar('central:biblioteca'),
    categoria: chamar('central:categoria'),
    agenda: chamar('central:agenda'),
    agendaAcao: chamar('central:agendaAcao'),
    agendaApagar: chamar('central:agendaApagar'),
    testar: chamar('central:testar'),
    baixar: chamar('central:baixar'),
    agendar: chamar('central:agendar'),
  },
  envio: {
    escolherVideos: chamar('envio:escolherVideos'),
    escolherPasta: chamar('envio:escolherPasta'),
    infoVideos: chamar('envio:infoVideos'),
    escolherCapa: chamar('envio:escolherCapa'),
    previaCapa: chamar('envio:previaCapa'),
    gerarTextos: chamar('envio:gerarTextos'),
    ultimoAgendado: chamar('envio:ultimoAgendado'),
    contador: chamar('envio:contador'),
    adicionar: chamar('envio:adicionar'),
  },
  canais: {
    listar: chamar('canais:listar'),
    autorizar: chamar('canais:autorizar'),
    porToken: chamar('canais:porToken'),
    remover: chamar('canais:remover'),
  },
  fila: {
    listar: chamar('fila:listar'),
    adicionar: chamar('fila:adicionar'),
    cancelar: chamar('fila:cancelar'),
    remover: chamar('fila:remover'),
    retentar: chamar('fila:retentar'),
    limpar: chamar('fila:limpar'),
    abrirReceita: chamar('fila:abrirReceita'),
    outrosPcs: chamar('fila:outrosPcs'),
  },
  fabrica: {
    listar: chamar('fabrica:listar'),
    criar: chamar('fabrica:criar'),
    acao: chamar('fabrica:acao'),
  },
  creditos: { ler: chamar('creditos:ler') },
  caminhoDoArquivo: (file) => webUtils.getPathForFile(file),
  ao: (canal, fn) => {
    const permitidos = ['fila:mudou', 'sistema:cpu', 'app:progressoAtualizacao', 'central:progresso', 'criar:navegou', 'criar:carregando', 'criar:erro', 'criar:download', 'sync:feito', 'creditos:status', 'abrir:agenda'];
    if (!permitidos.includes(canal)) return;
    ipcRenderer.on(canal, (_e, dados) => fn(dados));
  },
});
