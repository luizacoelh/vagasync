// Roda em /nova-vaga do VagaSync, na aba aberta pela extensão
// (#captura=<id>). Quando a página avisa que está pronta, pede ao background.js
// a captura desse id e a entrega à página; quando a página confirma o
// recebimento, pede para apagar. Contrato em lib/extensionCapture.ts.
const id = new URLSearchParams(location.hash.slice(1)).get("captura");

if (id) {
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const type = event.data?.type;
    try {
      if (type === "vagasync:pronto") {
        const captura = await chrome.runtime.sendMessage({ type: "pegar", id });
        if (!captura?.text) return;
        window.postMessage({ type: "vagasync:captura", captura }, location.origin);
      } else if (type === "vagasync:recebido") {
        await chrome.runtime.sendMessage({ type: "apagar", id });
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch {
      // extensão recarregada ou indisponível: a página segue sem a captura
    }
  });
}
