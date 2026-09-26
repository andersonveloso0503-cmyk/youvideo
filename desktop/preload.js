const { contextBridge, ipcRenderer, webUtils } = require('electron');

const chamar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld('api', {
  config: { ler: chamar('config:ler'), salvar: chamar('config:salvar'), salvarProjeto: chamar('config:salvarProjeto') },
  sistema: { info: chamar('sistema:info') },
  dialogo: {
    musicas: chamar('dialogo:musicas'),
    pastaMusicas: chamar('dialogo:pastaMusicas'),
    fundos: chamar('dialogo:fundos'),
    pastaSaida: chamar('dialogo:pastaSaida'),
  },
  midia: { musicas: chamar('midia:musicas') },
  abrir: { pasta: chamar('abrir:pasta'), link: chamar('abrir:link') },
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
  },
  caminhoDoArquivo: (file) => webUtils.getPathForFile(file),
  ao: (canal, fn) => {
    const permitidos = ['fila:mudou', 'sistema:cpu'];
    if (!permitidos.includes(canal)) return;
    ipcRenderer.on(canal, (_e, dados) => fn(dados));
  },
});
