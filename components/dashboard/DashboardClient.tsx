"use client";

import { useMemo, useState } from "react";
import { JobSummary } from "@/types/job";
import JobCard from "@/components/job/JobCard";
import JobTable from "@/components/job/JobTable";
import FilterBar, { FilterState } from "@/components/dashboard/FilterBar";
import StatsBar from "@/components/dashboard/StatsBar";
import EmptyState from "@/components/ui/EmptyState";

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

  const availableTechs = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((job) => job.technologies.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const search = normalize(filters.search);

    return jobs.filter((job) => {
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
  }, [jobs, filters]);

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
      />

      {filteredJobs.length === 0 ? (
        <EmptyState
          title="Nenhuma vaga encontrada com esses filtros."
          subtitle="Tenta limpar os filtros ou ajustar a pesquisa."
          showCta={false}
        />
      ) : view === "cards" ? (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <JobTable jobs={filteredJobs} />
      )}
    </>
  );
}
