import Link from "next/link";
import { JobSummary } from "@/types/job";
import StatusBadge from "@/components/ui/StatusBadge";
import GlassPanel from "@/components/ui/Glass";
import { LOCATION_LABELS } from "@/lib/jobLocation";

export default function JobCard({ job }: { job: JobSummary }) {
  return (
    <Link href={`/vaga/${job.id}`} className="block transition-transform hover:-translate-y-0.5">
      <GlassPanel>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
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
    </Link>
  );
}
