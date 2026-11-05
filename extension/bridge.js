// Roda em /nova-vaga do VagaSync. Quando a página avisa que está pronta, pede
// a captura ao background.js e a entrega à página; quando a página confirma o
// recebimento, pede para apagar. Contrato em lib/extensionCapture.ts.
window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const type = event.data?.type;
  if (type === "vagasync:pronto") {
    const captura = await chrome.runtime.sendMessage({ type: "pegar" });
    if (!captura?.text) return;
    window.postMessage({ type: "vagasync:captura", captura }, location.origin);
  } else if (type === "vagasync:recebido") {
    chrome.runtime.sendMessage({ type: "apagar" });
  }
});
