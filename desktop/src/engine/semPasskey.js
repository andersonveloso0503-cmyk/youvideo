// Preload das janelas do YouTube Studio: desliga a "chave de acesso" (passkey/WebAuthn) do Google.
// Sem isso o Google chama o Windows Hello e aparece "Segurança do Windows — Selecione uma credencial" / PIN toda hora.
// Com a chave de acesso desligada, o Google pede a senha normal (uma vez) e depois não pergunta mais.
const { webFrame } = require('electron');
webFrame.executeJavaScript(`(() => {
  try {
    const nega = () => Promise.reject(new DOMException('Chave de acesso desligada no Compilador', 'NotAllowedError'));
    if (navigator.credentials) {
      Object.defineProperty(navigator.credentials, 'get', { value: nega, configurable: true });
      Object.defineProperty(navigator.credentials, 'create', { value: nega, configurable: true });
    }
    try { delete window.PublicKeyCredential; } catch (e) {}
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
  } catch (e) {}
})()`);
