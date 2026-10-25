import Link from "next/link";
import { JobSummary } from "@/types/job";
import StatusBadge from "@/components/ui/StatusBadge";
import GlassPanel from "@/components/ui/Glass";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { SelectBox } from "@/components/ui/SelectionBar";

// No modo de seleção do dashboard o card vira um botão que marca/desmarca
// (em vez de abrir a vaga).
export default function JobCard({
  job,
  selecting = false,
  selected = false,
  onToggle,
}: {
  job: JobSummary;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const card = (
    <GlassPanel>
      <div className="flex items-start justify-between gap-4">
        {selecting && (
          <span className="mt-1">
            <SelectBox checked={selected} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-[#7C8494] uppercase tracking-wide truncate">
            {job.company}
          </p>
          <h2 className="mt-1 text-lg font-medium truncate">{job.title}</h2>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {job.summary && (
        <p className="mt-2 line-clamp-2 text-sm text-[#C4C7D0]">{job.summary}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7C8494]">
        <span>{LOCATION_LABELS[job.location]}</span>
        {job.salary && (
          <>
            <span className="text-white/15">•</span>
            <span>{job.salary}</span>
          </>
        )}
        <span className="text-white/15">•</span>
        <span>
          Candidatura em{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }).format(job.appliedAt)}
        </span>
      </div>
    </GlassPanel>
  );

  if (selecting) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        // Destaque por ring (box-shadow), não por opacity: opacity < 1 no
        // wrapper muda como o backdrop-filter do vidro é desenhado.
        className={`block w-full rounded-[22px] text-left ${selected ? "ring-2 ring-[#378ADD]/60" : ""}`}
      >
        {card}
      </button>
    );
  }

  return (
    <Link href={`/vaga/${job.id}`} className="block transition-transform hover:-translate-y-0.5">
      {card}
    </Link>
  );
}
