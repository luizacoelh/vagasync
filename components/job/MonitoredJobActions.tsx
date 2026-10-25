"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markJobsInterested, discardJobs } from "@/app/actions/jobs";

const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

// Ações da página de uma vaga MONITORADA — as mesmas da lista de
// /monitoradas. Depois de agir, volta para /monitoradas no mesmo ponto da
// rolagem (lib/monitoredView.ts), com o aviso na URL; o descarte traz
// "Desfazer" por lá.
export default function MonitoredJobActions({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"interest" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "interest" | "discard") {
    setPending(kind);
    setError(null);
    try {
      const result = kind === "interest" ? await markJobsInterested([jobId]) : await discardJobs([jobId]);
      if ("error" in result) {
        setError(result.error);
        setPending(null);
        return;
      }
      router.push(kind === "interest" ? "/monitoradas?interesse=1" : `/monitoradas?descartada=${jobId}`);
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => act("discard")}
          disabled={pending !== null}
          className="glass-btn rounded-xl px-3.5 py-2 text-sm text-[#C4C7D0] disabled:opacity-50"
          style={OUTFIT}
        >
          {pending === "discard" ? "Descartando..." : "Descartar"}
        </button>
        <button
          type="button"
          onClick={() => act("interest")}
          disabled={pending !== null}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-[#08131F] transition-shadow disabled:opacity-60"
          style={{
            ...OUTFIT,
            background: "linear-gradient(155deg, #85B7EB, #378ADD)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
          }}
        >
          {pending === "interest" ? "Movendo..." : "Tenho interesse"}
        </button>
      </div>
      {error && <p className="text-xs text-[#E5534B]">{error}</p>}
    </div>
  );
}
