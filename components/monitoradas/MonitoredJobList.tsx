"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { JobSummary } from "@/types/job";
import GlassPanel from "@/components/ui/Glass";
import TechBadge from "@/components/ui/TechBadge";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { markJobInterested, discardJob, restoreDiscardedJob } from "@/app/actions/jobs";

export interface JobGroup {
  key: string; // dia no formato YYYY-MM-DD
  label: string; // "Hoje", "Ontem" ou dd/mm/aaaa
  jobs: JobSummary[];
}

const MAX_TECHS = 5;
const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;
const UNDO_MS = 8000;

export default function MonitoredJobList({ groups }: { groups: JobGroup[] }) {
  // Atualização otimista: a vaga some no clique, antes de a Server Action
  // responder, e volta se o servidor recusar. A resposta da action já traz a
  // lista re-renderizada (revalidatePath), então não há router.refresh().
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Última vaga descartada, para o aviso com "Desfazer". Descartar não apaga
  // (vira DESCARTADA), por isso dispensa confirmação.
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  function setVisible(id: string, visible: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(id: string, action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    setVisible(id, false);
    try {
      const result = await action();
      if ("error" in result) {
        setVisible(id, true);
        setError(result.error);
        return false;
      }
      return true;
    } catch {
      setVisible(id, true);
      setError("Falha de conexão. Tente novamente.");
      return false;
    }
  }

  function markInterested(id: string) {
    if (undo?.id === id) setUndo(null);
    return run(id, () => markJobInterested(id));
  }

  async function discard(job: JobSummary) {
    setUndo({ id: job.id, title: job.title });
    const ok = await run(job.id, () => discardJob(job.id));
    if (!ok) setUndo((current) => (current?.id === job.id ? null : current));
  }

  async function restore(id: string) {
    setUndo(null);
    setError(null);
    try {
      const result = await restoreDiscardedJob(id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setVisible(id, true);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    }
  }

  const visibleGroups = groups
    .map((group) => ({ ...group, jobs: group.jobs.filter((job) => !hidden.has(job.id)) }))
    .filter((group) => group.jobs.length > 0);

  const undoToast = undo && (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#12151b]/95 px-4 py-3 text-sm shadow-lg sm:bottom-6"
      style={OUTFIT}
    >
      <span className="min-w-0 truncate text-[#C4C7D0]">Vaga descartada: {undo.title}</span>
      <button
        type="button"
        onClick={() => restore(undo.id)}
        className="shrink-0 font-semibold text-[#85B7EB] hover:underline"
      >
        Desfazer
      </button>
    </div>
  );

  if (visibleGroups.length === 0) {
    return (
      <>
        <GlassPanel plateClassName="p-8 text-center">
          <p className="text-lg font-medium" style={OUTFIT}>
            Nenhuma vaga monitorada por enquanto.
          </p>
          <p className="mt-2 text-sm text-[#7C8494]">
            Quando o monitoramento automático encontrar vagas novas, elas aparecem aqui para você
            avaliar.
          </p>
        </GlassPanel>
        {undoToast}
      </>
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
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-[#08131F] transition-shadow"
                      style={{
                        ...OUTFIT,
                        background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                        boxShadow:
                          "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
                      }}
                    >
                      Tenho interesse
                    </button>

                    <button
                      type="button"
                      onClick={() => discard(job)}
                      className="glass-btn rounded-xl px-3.5 py-2 text-sm text-[#C4C7D0]"
                      style={OUTFIT}
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              );
            })}
          </GlassPanel>
        </section>
      ))}
      {undoToast}
    </div>
  );
}
