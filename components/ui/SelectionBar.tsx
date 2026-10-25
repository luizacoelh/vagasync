"use client";

import type { ReactNode } from "react";

const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

// Barra fixa no rodapé do modo de seleção em lote (dashboard e /monitoradas).
// As ações (Excluir, Descartar...) vêm como children.
export default function SelectionBar({
  count,
  total,
  onSelectAll,
  onCancel,
  children,
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const allSelected = count === total && total > 0;

  return (
    <div
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-[#12151b]/95 px-4 py-3 text-sm shadow-lg sm:bottom-6"
      style={OUTFIT}
    >
      <span className="text-[#C4C7D0]">
        {count === 0 ? "Nenhuma selecionada" : `${count} ${count === 1 ? "selecionada" : "selecionadas"}`}
      </span>
      <button
        type="button"
        onClick={onSelectAll}
        className="text-xs text-[#85B7EB] hover:underline"
      >
        {allSelected ? "Limpar seleção" : "Selecionar todas"}
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[#7C8494] transition-colors hover:text-[#C4C7D0]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Caixinha de seleção usada nos cards em modo de seleção.
export function SelectBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
        checked
          ? "border-[#85B7EB]/70 bg-[#378ADD]/30 text-[#E4E6EB]"
          : "glass-chip border-white/20"
      }`}
    >
      {checked && "✔"}
    </span>
  );
}
