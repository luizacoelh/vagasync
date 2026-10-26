"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem } from "@/app/actions/jobs";
import { useLoginGate } from "@/components/auth/LoginGate";

// Checklist marcável da página da vaga. Atualização otimista: o item muda na
// hora e volta ao estado anterior se o servidor recusar.
export default function JobChecklist({
  jobId,
  items,
  initialDone,
}: {
  jobId: string;
  items: string[];
  initialDone: number[];
}) {
  const [done, setDone] = useState(() => new Set(initialDone));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { requireLogin } = useLoginGate();

  function setItem(index: number, value: boolean) {
    setDone((prev) => {
      const next = new Set(prev);
      if (value) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  function toggle(index: number) {
    if (requireLogin("Entre para marcar o que já estudou em cada vaga.")) return;
    const value = !done.has(index);
    setItem(index, value);
    setError(null);

    startTransition(async () => {
      const result = await toggleChecklistItem(jobId, index, value);
      if ("error" in result) {
        setItem(index, !value);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <p className="mb-2 text-xs text-[#7C8494]">
        {done.size} de {items.length} concluídos
      </p>
      <ul className="space-y-1">
        {items.map((text, i) => {
          const checked = done.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(i)}
                className="flex w-full gap-3 py-0.5 text-left text-sm"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    checked
                      ? "border-[#4ADE80]/60 bg-[#4ADE80]/20 text-[#4ADE80]"
                      : "glass-chip border-white/15"
                  }`}
                  aria-hidden="true"
                >
                  {checked && "✔"}
                </span>
                <span className={checked ? "text-[#7C8494] line-through" : "text-[#C4C7D0]"}>
                  {text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-[#E5534B]">{error}</p>}
    </div>
  );
}
