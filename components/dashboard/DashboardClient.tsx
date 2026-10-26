"use client";

import { useCallback, useMemo, useState } from "react";
import { JobSummary } from "@/types/job";
import JobCard from "@/components/job/JobCard";
import JobTable from "@/components/job/JobTable";
import FilterBar, { FilterState } from "@/components/dashboard/FilterBar";
import StatsBar from "@/components/dashboard/StatsBar";
import EmptyState from "@/components/ui/EmptyState";
import SelectionBar from "@/components/ui/SelectionBar";
import ActionToast from "@/components/ui/ActionToast";
import { deleteJobs } from "@/app/actions/jobs";
import { useLoginGate } from "@/components/auth/LoginGate";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export default function DashboardClient({ jobs }: { jobs: JobSummary[] }) {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "TODOS",
    location: "TODOS",
    tech: "TODAS",
  });
  const [view, setView] = useState<"cards" | "table">("cards");

  // Seleção em lote para excluir várias vagas. Excluir apaga de verdade (não
  // há "Desfazer"), então pede uma confirmação na própria barra.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const { requireLogin } = useLoginGate();

  const availableTechs = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((job) => job.technologies.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const search = normalize(filters.search);

    return jobs.filter((job) => {
      if (hidden.has(job.id)) return false;
      if (filters.status !== "TODOS" && job.status !== filters.status) return false;
      if (filters.location !== "TODOS" && job.location !== filters.location) return false;
      if (filters.tech !== "TODAS" && !job.technologies.includes(filters.tech)) return false;

      if (search !== "") {
        const haystack = normalize(
          [job.company, job.title, ...job.technologies].join(" ")
        );
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [jobs, filters, hidden]);

  // Seleção só conta o que está na tela (um filtro pode ter escondido algo marcado).
  const visibleIds = filteredJobs.map((job) => job.id);
  const selectedIds = visibleIds.filter((id) => selected.has(id));

  function toggleSelected(id: string) {
    setConfirming(false);
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
    setConfirming(false);
  }

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

  // Otimista: as vagas somem na hora e voltam se o servidor recusar.
  async function deleteSelected() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    stopSelecting();
    setVisible(ids, false);
    setToast(ids.length === 1 ? "Vaga excluída" : `${ids.length} vagas excluídas`);
    try {
      const result = await deleteJobs(ids);
      if ("error" in result) {
        setVisible(ids, true);
        setToast(result.error);
      }
    } catch {
      setVisible(ids, true);
      setToast("Falha de conexão. Tente novamente.");
    }
  }

  if (jobs.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <StatsBar jobs={jobs} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        availableTechs={availableTechs}
        view={view}
        onViewChange={setView}
        selecting={selecting}
        onToggleSelecting={() => (selecting ? stopSelecting() : setSelecting(true))}
      />

      {filteredJobs.length === 0 ? (
        <EmptyState
          title="Nenhuma vaga encontrada com esses filtros."
          subtitle="Tenta limpar os filtros ou ajustar a pesquisa."
          showCta={false}
        />
      ) : view === "cards" ? (
        <div className={`space-y-3 ${selecting ? "pb-24" : ""}`}>
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              selecting={selecting}
              selected={selected.has(job.id)}
              onToggle={() => toggleSelected(job.id)}
            />
          ))}
        </div>
      ) : (
        <div className={selecting ? "pb-24" : ""}>
          <JobTable jobs={filteredJobs} selecting={selecting} selected={selected} onToggle={toggleSelected} />
        </div>
      )}

      {selecting && (
        <SelectionBar
          count={selectedIds.length}
          total={visibleIds.length}
          onSelectAll={() => {
            setConfirming(false);
            setSelected(selectedIds.length === visibleIds.length ? new Set() : new Set(visibleIds));
          }}
          onCancel={stopSelecting}
        >
          {confirming ? (
            <>
              <span className="text-xs text-[#7C8494]">Excluir de vez?</span>
              <button
                type="button"
                onClick={deleteSelected}
                className="text-xs font-semibold text-[#E5534B] hover:underline"
              >
                Sim, excluir {selectedIds.length}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => !requireLogin("Entre para gerenciar as suas vagas.") && setConfirming(true)}
              disabled={selectedIds.length === 0}
              className="text-xs font-semibold text-[#E5534B] hover:underline disabled:opacity-40"
            >
              Excluir
            </button>
          )}
        </SelectionBar>
      )}

      {toast && !selecting && <ActionToast message={toast} onClose={closeToast} duration={4000} />}
    </>
  );
}
