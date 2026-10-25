"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { JobSummary } from "@/types/job";
import GlassPanel from "@/components/ui/Glass";
import TechBadge from "@/components/ui/TechBadge";
import ActionToast from "@/components/ui/ActionToast";
import SelectionBar, { SelectBox } from "@/components/ui/SelectionBar";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { saveMonitoredView, takeMonitoredView } from "@/lib/monitoredView";
import { markJobsInterested, discardJobs, restoreDiscardedJobs } from "@/app/actions/jobs";

export interface JobGroup {
  key: string; // dia no formato YYYY-MM-DD
  label: string; // "Hoje", "Ontem" ou dd/mm/aaaa
  jobs: JobSummary[];
}

// Aviso vindo da página da vaga (descartou ou marcou interesse lá dentro e
// voltou para cá) — ver app/monitoradas/page.tsx.
export type MonitoredNotice = { kind: "discarded"; id: string } | { kind: "interested" };

type Toast = { message: string; undoIds?: string[] };

const MAX_TECHS = 5;
const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

// Busca sem caixa e sem acento ("estagio" acha "Estágio").
function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function noticeToast(notice: MonitoredNotice | null): Toast | null {
  if (!notice) return null;
  if (notice.kind === "discarded") return { message: "Vaga descartada", undoIds: [notice.id] };
  return { message: "Vaga movida para suas candidaturas" };
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : `${count} ${many}`;
}

export default function MonitoredJobList({
  groups,
  notice = null,
}: {
  groups: JobGroup[];
  notice?: MonitoredNotice | null;
}) {
  // Atualização otimista: a vaga some no clique, antes de a Server Action
  // responder, e volta se o servidor recusar. A resposta da action já traz a
  // lista re-renderizada (revalidatePath), então não há router.refresh().
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(() => noticeToast(notice));
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const closeToast = useCallback(() => setToast(null), []);

  // Volta da página da vaga: restaura busca e rolagem, e tira o aviso da URL
  // para um F5 não repetir o "Vaga descartada".
  useEffect(() => {
    if (notice) window.history.replaceState(null, "", "/monitoradas");
    const view = takeMonitoredView();
    if (!view) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage só existe no cliente
    setSearch(view.search);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, view.scrollY)));
  }, [notice]);

  function setVisible(ids: string[], visible: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (visible) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function run(
    ids: string[],
    action: () => Promise<{ ok: true; count: number } | { error: string }>
  ): Promise<boolean> {
    setError(null);
    setVisible(ids, false);
    try {
      const result = await action();
      if ("error" in result) {
        setVisible(ids, true);
        setError(result.error);
        return false;
      }
      return true;
    } catch {
      setVisible(ids, true);
      setError("Falha de conexão. Tente novamente.");
      return false;
    }
  }

  async function markInterested(ids: string[]) {
    setToast({ message: plural(ids.length, "Vaga movida para suas candidaturas", "vagas movidas para suas candidaturas") });
    const ok = await run(ids, () => markJobsInterested(ids));
    if (!ok) setToast(null);
  }

  // Descartar não apaga (vira DESCARTADA), por isso dispensa confirmação:
  // o aviso traz "Desfazer".
  async function discard(ids: string[]) {
    setToast({ message: plural(ids.length, "Vaga descartada", "vagas descartadas"), undoIds: ids });
    const ok = await run(ids, () => discardJobs(ids));
    if (!ok) setToast(null);
  }

  async function restore(ids: string[]) {
    setToast(null);
    setError(null);
    try {
      const result = await restoreDiscardedJobs(ids);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setVisible(ids, true);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    }
  }

  const visibleGroups = useMemo(() => {
    const term = normalize(search);
    return groups
      .map((group) => ({
        ...group,
        jobs: group.jobs.filter((job) => {
          if (hidden.has(job.id)) return false;
          if (!term) return true;
          return normalize(
            [job.company, job.title, job.summary ?? "", ...job.technologies].join(" ")
          ).includes(term);
        }),
      }))
      .filter((group) => group.jobs.length > 0);
  }, [groups, hidden, search]);

  const visibleIds = visibleGroups.flatMap((group) => group.jobs.map((job) => job.id));
  // Seleção só conta o que está na tela (a busca pode ter escondido algo marcado).
  const selectedIds = visibleIds.filter((id) => selected.has(id));
  const hasJobs = groups.some((group) => group.jobs.some((job) => !hidden.has(job.id)));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  function bulk(action: (ids: string[]) => Promise<void>) {
    if (selectedIds.length === 0) return;
    const ids = selectedIds;
    stopSelecting();
    void action(ids);
  }

  const toastNode = toast && !selecting && (
    <ActionToast
      message={toast.message}
      actionLabel={toast.undoIds ? "Desfazer" : undefined}
      onAction={toast.undoIds ? () => restore(toast.undoIds!) : undefined}
      onClose={closeToast}
    />
  );

  const errorNode = error && (
    <div className="rounded-xl border border-[#E5534B]/40 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
      {error}
    </div>
  );

  if (!hasJobs) {
    return (
      <div className="space-y-6">
        {errorNode}
        <GlassPanel plateClassName="p-8 text-center">
          <p className="text-lg font-medium" style={OUTFIT}>
            Nenhuma vaga monitorada por enquanto.
          </p>
          <p className="mt-2 text-sm text-[#7C8494]">
            Quando o monitoramento automático encontrar vagas novas, elas aparecem aqui para você
            avaliar.
          </p>
        </GlassPanel>
        {toastNode}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${selecting ? "pb-24" : ""}`}>
      <div className="flex gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por empresa, cargo ou tecnologia..."
          aria-label="Pesquisar vagas monitoradas"
          className="glass-input w-full flex-1 rounded-xl px-4 py-2 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
        />
        <button
          type="button"
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          className={`glass-btn shrink-0 rounded-xl px-3.5 py-2 text-sm ${
            selecting ? "text-[#85B7EB]" : "text-[#C4C7D0]"
          }`}
          style={OUTFIT}
        >
          {selecting ? "Concluir" : "Selecionar"}
        </button>
      </div>

      {errorNode}

      {visibleGroups.length === 0 && (
        <p className="px-1 text-sm text-[#7C8494]">Nenhuma vaga encontrada para essa pesquisa.</p>
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
              const isSelected = selected.has(job.id);

              return (
                <div
                  key={job.id}
                  className={`relative px-5 py-4 transition-colors hover:bg-white/[0.03] ${
                    isSelected ? "bg-[#378ADD]/[0.08]" : ""
                  }`}
                >
                  {/* O quadro inteiro abre a vaga (link "esticado" por cima de
                      tudo); os botões ficam acima dele com z-10. No modo de
                      seleção, o mesmo quadro marca/desmarca. */}
                  {selecting ? (
                    <button
                      type="button"
                      onClick={() => toggleSelected(job.id)}
                      aria-pressed={isSelected}
                      aria-label={`Selecionar ${job.title}`}
                      className="absolute inset-0 z-0"
                    />
                  ) : (
                    <Link
                      href={`/vaga/${job.id}`}
                      onClick={() => saveMonitoredView({ search, scrollY: window.scrollY })}
                      aria-label={`Abrir ${job.title}`}
                      className="absolute inset-0 z-0"
                    />
                  )}

                  <div className="pointer-events-none relative flex gap-3">
                    {selecting && (
                      <span className="mt-0.5">
                        <SelectBox checked={isSelected} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs uppercase tracking-wide text-[#7C8494]" style={OUTFIT}>
                        {job.company}
                      </p>
                      <h3 className="mt-1 text-base font-medium text-[#E4E6EB]" style={OUTFIT}>
                        {job.title}
                      </h3>

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
                    </div>
                  </div>

                  {!selecting && (
                    <div className="relative z-10 mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => markInterested([job.id])}
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
                        onClick={() => discard([job.id])}
                        className="glass-btn rounded-xl px-3.5 py-2 text-sm text-[#C4C7D0]"
                        style={OUTFIT}
                      >
                        Descartar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </GlassPanel>
        </section>
      ))}

      {selecting && (
        <SelectionBar
          count={selectedIds.length}
          total={visibleIds.length}
          onSelectAll={() =>
            setSelected(selectedIds.length === visibleIds.length ? new Set() : new Set(visibleIds))
          }
          onCancel={stopSelecting}
        >
          <button
            type="button"
            onClick={() => bulk(markInterested)}
            disabled={selectedIds.length === 0}
            className="text-xs font-semibold text-[#85B7EB] hover:underline disabled:opacity-40"
          >
            Tenho interesse
          </button>
          <button
            type="button"
            onClick={() => bulk(discard)}
            disabled={selectedIds.length === 0}
            className="text-xs font-semibold text-[#E5534B] hover:underline disabled:opacity-40"
          >
            Descartar
          </button>
        </SelectionBar>
      )}

      {toastNode}
    </div>
  );
}
