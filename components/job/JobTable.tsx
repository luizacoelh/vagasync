import Link from "next/link";
import { JobSummary } from "@/types/job";
import StatusBadge from "@/components/ui/StatusBadge";
import GlassPanel from "@/components/ui/Glass";
import { LOCATION_LABELS } from "@/lib/jobLocation";

export default function JobTable({ jobs }: { jobs: JobSummary[] }) {
  return (
    <GlassPanel plateClassName="overflow-x-auto" hotspots={false}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] text-left font-mono text-xs uppercase tracking-wide text-[#7C8494]">
            <th className="px-4 py-3 font-medium">Empresa</th>
            <th className="px-4 py-3 font-medium">Cargo</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Tecnologias</th>
            <th className="px-4 py-3 font-medium">Local</th>
            <th className="px-4 py-3 font-medium">Data</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-white/10 last:border-0 hover:bg-white/[0.04]">
              <td className="px-4 py-3">
                <Link href={`/vaga/${job.id}`} className="block text-[#E4E6EB] hover:text-[#378ADD]">
                  {job.company}
                </Link>
              </td>
              <td className="px-4 py-3 text-[#C4C7D0]">{job.title}</td>
              <td className="px-4 py-3">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-4 py-3 text-[#7C8494]">
                {job.technologies.slice(0, 3).join(", ")}
                {job.technologies.length > 3 ? ` +${job.technologies.length - 3}` : ""}
              </td>
              <td className="px-4 py-3 text-[#7C8494]">{LOCATION_LABELS[job.location]}</td>
              <td className="px-4 py-3 text-[#7C8494]">
                {new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }).format(job.appliedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassPanel>
  );
}
