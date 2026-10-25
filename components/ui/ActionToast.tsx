"use client";

import { useEffect } from "react";

const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

// Aviso fixo no rodapé depois de uma ação ("Vaga descartada · Desfazer").
// Some sozinho depois de `duration`; o componente pai decide o que mostrar
// trocando `message` (cada troca reinicia o tempo).
export default function ActionToast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 8000,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#12151b]/95 px-4 py-3 text-sm shadow-lg sm:bottom-6"
      style={OUTFIT}
    >
      <span className="min-w-0 truncate text-[#C4C7D0]">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 font-semibold text-[#85B7EB] hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
