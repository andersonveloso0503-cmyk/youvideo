# Youvideo

Painel de criação de vídeos bíblicos com IA (roteiro → narração → imagens/vídeo → montagem → thumbnail → publicação no YouTube).

## Como usar

1. Faça upload de todos os arquivos deste projeto no repositório GitHub `youvideo` (substituindo o README inicial).
2. No Vercel, configure as variáveis de ambiente (veja `.env.example` para a lista completa).
3. Faça o deploy.
4. Depois do deploy, acesse `SEU_DOMINIO.vercel.app/api/auth/google` **uma vez** pra autorizar sua conta do YouTube — a tela final vai te mostrar o `YOUTUBE_REFRESH_TOKEN` pra você salvar no Vercel.

## Status atual das etapas

- ✅ **Roteiro** — funcional (usa Groq, mesma API já usada no LCS Hub)
- ⏳ **Narração** — pronta pra ativar assim que a `ELEVENLABS_API_KEY` for adicionada (falta conectar o Vercel Blob pra salvar o áudio)
- ⏳ **Imagens/vídeo** — estrutura pronta, falta a chamada real às APIs da Flux e da Kling
- ⏳ **Material de apoio (b-roll)** — endpoint pronto (`/api/stock-media`), usa Pexels
- ⏳ **Montagem** — estrutura pronta, falta montar o timeline real da Shotstack
- ⏳ **Thumbnail** — estrutura pronta, falta a chamada real à Flux
- ⏳ **Publicação no YouTube** — OAuth funcional, falta conectar o vídeo final montado ao upload

## Boas práticas já embutidas no roteiro

- Narração é sempre reescrita com palavras próprias (nunca copia tradução da Bíblia literalmente)
- Cada vídeo é dividido em cenas com descrições visuais próprias (evita conteúdo repetitivo/template)
