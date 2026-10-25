"use client";

import { JobStatus, JobLocation } from "@prisma/client";
import { STATUS_LABELS, DASHBOARD_STATUSES } from "@/lib/jobStatus";
import { LOCATION_LABELS } from "@/lib/jobLocation";

export interface FilterState {
  search: string;
  status: JobStatus | "TODOS";
  location: JobLocation | "TODOS";
  tech: string | "TODAS";
}

export default function FilterBar({
  filters,
  onChange,
  availableTechs,
  view,
  onViewChange,
  selecting,
  onToggleSelecting,
}: {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableTechs: string[];
  view: "cards" | "table";
  onViewChange: (view: "cards" | "table") => void;
  selecting: boolean;
  onToggleSelecting: () => void;
}) {
  const hasActiveFilters =
    filters.search !== "" || filters.status !== "TODOS" || filters.location !== "TODOS" || filters.tech !== "TODAS";

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Pesquisar por empresa, cargo ou tecnologia..."
          className="glass-input w-full rounded-xl px-4 py-2 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C] sm:flex-1"
        />

        <div className="glass-input flex shrink-0 gap-1 rounded-xl p-1">
          <button
            onClick={() => onViewChange("cards")}
            className={`rounded-lg px-3 py-1 text-xs font-mono transition-colors ${
              view === "cards" ? "bg-[#378ADD] text-white" : "text-[#7C8494] hover:text-[#E4E6EB]"
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => onViewChange("table")}
            className={`rounded-lg px-3 py-1 text-xs font-mono transition-colors ${
              view === "table" ? "bg-[#378ADD] text-white" : "text-[#7C8494] hover:text-[#E4E6EB]"
            }`}
          >
            Tabela
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value as FilterState["status"] })}
          className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono text-[#C4C7D0] sm:w-auto"
        >
          <option value="TODOS">Todos os status</option>
          {DASHBOARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          value={filters.location}
          onChange={(e) => onChange({ ...filters, location: e.target.value as FilterState["location"] })}
          className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono text-[#C4C7D0] sm:w-auto"
        >
          <option value="TODOS">Todos os locais</option>
          {Object.values(JobLocation).map((l) => (
            <option key={l} value={l}>
              {LOCATION_LABELS[l]}
            </option>
          ))}
        </select>

        <select
          value={filters.tech}
          onChange={(e) => onChange({ ...filters, tech: e.target.value })}
          className="glass-input col-span-2 w-full rounded-xl px-3 py-2 text-xs font-mono text-[#C4C7D0] sm:w-auto"
        >
          <option value="TODAS">Todas as tecnologias</option>
          {availableTechs.map((tech) => (
            <option key={tech} value={tech}>
              {tech}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => onChange({ search: "", status: "TODOS", location: "TODOS", tech: "TODAS" })}
            className="col-span-2 text-xs font-mono text-[#378ADD] hover:text-[#85B7EB] sm:col-span-1"
          >
            Limpar filtros
          </button>
        )}

        {/* Modo de seleção em lote (excluir várias vagas) — ver DashboardClient. */}
        <button
          type="button"
          onClick={onToggleSelecting}
          className={`glass-btn col-span-2 rounded-xl px-3 py-2 text-xs font-mono sm:col-span-1 sm:ml-auto ${
            selecting ? "text-[#85B7EB]" : "text-[#C4C7D0]"
          }`}
        >
          {selecting ? "Concluir" : "Selecionar"}
        </button>
      </div>
    </div>
  );
}
