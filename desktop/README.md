# Youvideo Compilador (app de PC)

App de Windows que monta compilações de músicas com onda de áudio, fundos, legenda e publicação no YouTube.
Tudo é gerado no próprio PC com ffmpeg (vem junto no instalador), então não há custo por vídeo nem limite de duração.

## Baixar
O instalador é gerado sozinho pelo GitHub Actions (`.github/workflows/compilador-windows.yml`) sempre que algo muda
nesta pasta, e fica em **Releases** com a tag `compilador-vX.Y.Z`. O painel web tem a página `/compilador` com o botão de download.

Para lançar uma versão nova: aumente `version` no `package.json` e envie para o GitHub.

## Estrutura
- `main.js` — janela, diálogos de arquivo, canais do YouTube e a fila
- `preload.js` — ponte segura entre a tela e o processo principal
- `renderer/` — a tela (HTML/CSS/JS puro, sem build)
- `src/engine/render.js` — monta áudio, fundos, onda, textos e o vídeo final
- `src/engine/fila.js` — fila de vídeos, divisão em partes, publicação
- `src/engine/separar.js` — voz/instrumental pela fal.ai (Demucs), com cache local
- `src/engine/legenda.js` — letra pelo Whisper da Groq, com cache local
- `src/engine/youtube.js` — autorização por canal e envio
- `src/store.js` — configurações e tokens (criptografados pelo Windows)

## Rodar em desenvolvimento
```
cd desktop
npm install
npm start          # abre o app
npm run teste      # gera vídeos de teste sem abrir o app
npm run dist       # gera o instalador (precisa rodar no Windows)
```

## Onde ficam os dados no PC
`%APPDATA%\Youvideo Compilador\` — `config.json`, `canais.json`, `fila.json` e a pasta `cache` (músicas já separadas e letras já transcritas).
