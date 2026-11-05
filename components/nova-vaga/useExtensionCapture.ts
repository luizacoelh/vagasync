"use client";

import { useEffect, useRef } from "react";
import { CAPTURE_MESSAGES, parseExtensionCapture, type ExtensionCapture } from "@/lib/extensionCapture";

// Recebe a vaga capturada pela extensão (contrato em lib/extensionCapture.ts).
// Só aceita mensagem da própria janela e da mesma origem (o content script da
// extensão roda nesta página). Visitante não recebe: a captura fica guardada na
// extensão até a pessoa entrar e abrir /nova-vaga de novo.
export function useExtensionCapture(enabled: boolean, onCapture: (capture: ExtensionCapture) => void) {
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
      handler.current(capture);
      window.postMessage({ type: CAPTURE_MESSAGES.received }, window.location.origin);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ type: CAPTURE_MESSAGES.ready }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled]);
}
