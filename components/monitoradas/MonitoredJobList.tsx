"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobSummary } from "@/types/job";
import GlassPanel from "@/components/ui/Glass";
import TechBadge from "@/components/ui/TechBadge";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { markJobInterested, deleteJob } from "@/app/actions/jobs";

export interface JobGroup {
  key: string; // dia no formato YYYY-MM-DD
  label: string; // "Hoje", "Ontem" ou dd/mm/aaaa
  jobs: JobSummary[];
}

const MAX_TECHS = 5;
const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

export default function MonitoredJobList({ groups }: { groups: JobGroup[] }) {
  const router = useRouter();
  // Esconde a vaga na hora (sem esperar o router.refresh terminar), pra a
  // lista responder de imediato ao clique.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // As duas ações passam por Server Actions em vez de fetch na API: só elas
  // invalidam o Client Router Cache, garantindo que o dashboard principal
  // reflita a vaga movida sem esperar o staleTime expirar.
  async function run(id: string, action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    setBusyId(id);
    try {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setHidden((prev) => new Set(prev).add(id));
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  }

  function markInterested(id: string) {
    return run(id, () => markJobInterested(id));
  }

  function discard(id: string) {
    return run(id, () => deleteJob(id));
  }

  const visibleGroups = groups
    .map((group) => ({ ...group, jobs: group.jobs.filter((job) => !hidden.has(job.id)) }))
    .filter((group) => group.jobs.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <GlassPanel plateClassName="p-8 text-center">
        <p className="text-lg font-medium" style={OUTFIT}>
          Nenhuma vaga monitorada por enquanto.
        </p>
        <p className="mt-2 text-sm text-[#7C8494]">
          Quando o monitoramento automático encontrar vagas novas, elas aparecem aqui para você
          avaliar.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-[#E5534B]/40 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
          {error}
        </div>
      )}

      {visibleGroups.map((group) => (
        <section key={group.key}>
          <h2
            className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
            style={OUTFIT}
          >
            {group.label} · {group.jobs.length}
          </h2>

          {/* Um painel de vidro por dia (e não um por vaga): o feed pode ter
              dezenas de itens e cada painel carrega o filtro de refração. */}
          <GlassPanel plateClassName="divide-y divide-white/8">
            {group.jobs.map((job) => {
              const busy = busyId === job.id;
              const extraTechs = job.technologies.length - MAX_TECHS;

              return (
                <div key={job.id} className="px-5 py-4">
                  <Link href={`/vaga/${job.id}`} className="group block min-w-0">
                    <p className="truncate text-xs uppercase tracking-wide text-[#7C8494]" style={OUTFIT}>
                      {job.company}
                    </p>
                    <h3
                      className="mt-1 text-base font-medium text-[#E4E6EB] transition-colors group-hover:text-[#85B7EB]"
                      style={OUTFIT}
                    >
                      {job.title}
                    </h3>
                  </Link>

                  {job.summary && (
                    <p className="mt-2 line-clamp-2 text-sm text-[#C4C7D0]">{job.summary}</p>
                  )}

                  {job.technologies.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.technologies.slice(0, MAX_TECHS).map((tech) => (
                        <TechBadge key={tech} tech={tech} />
                      ))}
                      {extraTechs > 0 && (
                        <span className="self-center text-xs text-[#7C8494]">+{extraTechs}</span>
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-[#7C8494]">
                    {LOCATION_LABELS[job.location]}
                    {job.salary && ` · ${job.salary}`}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => markInterested(job.id)}
                      disabled={busy}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-[#08131F] transition-shadow disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        ...OUTFIT,
                        background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                        boxShadow:
                          "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
                      }}
                    >
                      {busy ? "Aguarde..." : "Tenho interesse"}
                    </button>

                    {confirmingId === job.id ? (
                      <span className="flex items-center gap-3 text-xs" style={OUTFIT}>
                        <span className="text-[#7C8494]">Descartar esta vaga?</span>
                        <button
                          type="button"
                          onClick={() => discard(job.id)}
                          disabled={busy}
                          className="text-[#E5534B] hover:underline disabled:opacity-50"
                        >
                          Sim, descartar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="text-[#7C8494] transition-colors hover:text-[#C4C7D0]"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(job.id)}
                        disabled={busy}
                        className="glass-btn rounded-xl px-3.5 py-2 text-sm text-[#C4C7D0] disabled:opacity-50"
                        style={OUTFIT}
                      >
                        Descartar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </GlassPanel>
        </section>
      ))}
    </div>
  );
}
