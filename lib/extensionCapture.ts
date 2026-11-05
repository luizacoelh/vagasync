// Contrato entre a extensão do navegador (extension/) e /nova-vaga.
//
// A extensão lê a vaga da aba que a pessoa está vendo, abre /nova-vaga e o
// content script dela (extension/bridge.js) conversa com a página por
// window.postMessage:
//   página   → { type: "vagasync:pronto" }            (listener montado)
//   extensão → { type: "vagasync:captura", captura } (dados da vaga)
//   página   → { type: "vagasync:recebido" }          (pode apagar a captura)
// Nada vai para o servidor: a captura só preenche a aba "Colar texto", e a
// pessoa confere e clica em "Analisar", como se tivesse colado o texto.

export const CAPTURE_MESSAGES = {
  ready: "vagasync:pronto",
  capture: "vagasync:captura",
  received: "vagasync:recebido",
} as const;

export const CAPTURE_LIMITS = { textChars: 8000, urlChars: 2000 } as const;

export type ExtensionCapture = { text: string; url: string | null };

// Valida a mensagem recebida: só texto e link, com teto; link só http(s).
export function parseExtensionCapture(data: unknown): ExtensionCapture | null {
  if (!data || typeof data !== "object") return null;
  const message = data as { type?: unknown; captura?: unknown };
  if (message.type !== CAPTURE_MESSAGES.capture) return null;
  const capture = message.captura as { text?: unknown; url?: unknown } | null;
  if (!capture || typeof capture !== "object" || typeof capture.text !== "string") return null;
  const text = capture.text.trim().slice(0, CAPTURE_LIMITS.textChars);
  if (!text) return null;
  let url: string | null = null;
  if (typeof capture.url === "string" && capture.url.length <= CAPTURE_LIMITS.urlChars) {
    try {
      const parsed = new URL(capture.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.toString();
    } catch {
      // link inválido: segue só com o texto
    }
  }
  return { text, url };
}
