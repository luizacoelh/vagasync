"use client";

import type { KeyboardEvent } from "react";
import { OUTFIT } from "./ui";

export type InputTab = "link" | "texto";

const TABS: { id: InputTab; label: string }[] = [
  { id: "link", label: "Link da vaga" },
  { id: "texto", label: "Colar texto" },
];

export function tabId(tab: InputTab) {
  return `nova-vaga-aba-${tab}`;
}

export function panelId(tab: InputTab) {
  return `nova-vaga-painel-${tab}`;
}

// Abas "Link da vaga" / "Colar texto" no padrão WAI-ARIA: só a aba ativa entra
// no Tab; setas, Home e End trocam de aba.
export default function InputTabs({ tab, onChange }: { tab: InputTab; onChange: (tab: InputTab) => void }) {
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = TABS[next].id;
    onChange(target);
    document.getElementById(tabId(target))?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Como adicionar a vaga"
      className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1"
    >
      {TABS.map((t) => {
        const selected = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={tabId(t.id)}
            aria-selected={selected}
            aria-controls={panelId(t.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={handleKeyDown}
            className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? "bg-[#378ADD]/20 text-[#E4E6EB] ring-1 ring-[#378ADD]/45"
                : "text-[#7C8494] hover:text-[#C4C7D0]"
            }`}
            style={OUTFIT}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
