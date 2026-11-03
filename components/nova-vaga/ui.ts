import type { CSSProperties } from "react";

// Estilos repetidos pelas peças de /nova-vaga.

// Mesmo limite validado no servidor (app/api/analyze/route.ts) — aqui é só
// pra dar feedback imediato, o servidor sempre revalida.
export const MAX_DESCRIPTION_LENGTH = 8000;

export const OUTFIT: CSSProperties = { fontFamily: "var(--font-outfit)" };

export const LABEL_CLASS = "block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2";

export const PRIMARY_BUTTON_STYLE: CSSProperties = {
  fontFamily: "var(--font-outfit)",
  background: "linear-gradient(155deg, #85B7EB, #378ADD)",
  boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
};

export const PRIMARY_BUTTON_CLASS =
  "rounded-xl py-3 font-medium text-[#08131F] transition-shadow disabled:cursor-not-allowed disabled:opacity-50";

export const SECONDARY_BUTTON_CLASS =
  "glass-btn rounded-xl py-3 font-medium text-[#C4C7D0] disabled:cursor-not-allowed disabled:opacity-50";
