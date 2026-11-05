"use client";

import { useEffect, useRef } from "react";
import { CAPTURE_MESSAGES, parseExtensionCapture, type ExtensionCapture } from "@/lib/extensionCapture";

// Avisa a extensão que a captura foi usada (ela apaga a cópia guardada).
export function ackExtensionCapture() {
  window.postMessage({ type: CAPTURE_MESSAGES.received }, window.location.origin);
}

// Recebe a vaga capturada pela extensão (contrato em lib/extensionCapture.ts).
// Só aceita mensagem da própria janela e da mesma origem (o content script da
// extensão roda nesta página). Visitante não recebe. onCapture devolve true
// quando aplicou a captura; com false (já havia texto na tela) a página guarda a
// captura e só confirma depois, se a pessoa escolher usá-la.
export function useExtensionCapture(enabled: boolean, onCapture: (capture: ExtensionCapture) => boolean) {
  const handler = useRef(onCapture);
  useEffect(() => {
    handler.current = onCapture;
  });

  useEffect(() => {
    if (!enabled) return;
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const capture = parseExtensionCapture(event.data);
      if (!capture) return;
      if (handler.current(capture)) ackExtensionCapture();
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: CAPTURE_MESSAGES.ready }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled]);
}
