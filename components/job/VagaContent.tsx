"use client";

// VagaContent é o Client Component que exibe os detalhes de uma vaga, com os
// dados completos buscados pelo Server Component de app/vaga/[id]/page.tsx.
// O dashboard só carrega o recorte JobSummary, então o detalhe sempre vem do
// servidor (e fica no Router Cache para revisitas).

import { Job } from "@/types/job";
import StatusSelect from "@/components/job/StatusSelect";
import JobMetaEditor from "@/components/job/JobMetaEditor";
import DetailSection from "@/components/ui/DetailSection";
import TechBadge from "@/components/ui/TechBadge";
import JobChecklist from "@/components/job/JobChecklist";
import SkillCompatibility from "@/components/job/SkillCompatibility";
import DeleteJobButton from "@/components/job/DeleteJobButton";
import MonitoredJobActions from "@/components/job/MonitoredJobActions";
import GlassPanel from "@/components/ui/Glass";
import { LOCATION_LABELS } from "@/lib/jobLocation";

export default function VagaContent({
  serverJob: job,
  serverUserSkills: userSkills,
}: {
  serverJob: Job;
  serverUserSkills: string[];
}) {
  // Vaga MONITORADA ainda não é candidatura: em vez de status, exclusão e
  // dados da candidatura, mostra as ações de /monitoradas (Tenho interesse /
  // Descartar). O resto (análise da IA) é igual.
  const monitored = job.status === "MONITORADA";

  return (
    <>
      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm text-[#7C8494] uppercase tracking-wide">{job.company}</p>
          <h1 className="mt-1 text-2xl font-semibold" style={{ fontFamily: "var(--font-outfit)" }}>
            {job.title}
          </h1>
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-[#85B7EB] hover:text-[#378ADD] break-all"
            >
              {job.url} ↗
            </a>
          )}
          <p className="mt-2 text-xs text-[#7C8494]">
            {LOCATION_LABELS[job.location]}
            {job.salary && ` · ${job.salary}`}
          </p>
        </div>
        {!monitored && <StatusSelect jobId={job.id} initialStatus={job.status} />}
      </div>

      <div className="mt-4 flex justify-end">
        {monitored ? <MonitoredJobActions jobId={job.id} /> : <DeleteJobButton jobId={job.id} />}
      </div>

      <GlassPanel className="mt-6" plateClassName="p-6 space-y-6">
        {job.summary && (
          <DetailSection label="Resumo">
            <p className="text-sm text-[#C4C7D0] leading-relaxed">{job.summary}</p>
          </DetailSection>
        )}

        {job.technologies.length > 0 && (
          <DetailSection label="Tecnologias">
            <div className="flex flex-wrap gap-2">
              {job.technologies.map((tech) => (
                <TechBadge key={tech} tech={tech} />
              ))}
            </div>
          </DetailSection>
        )}

        {job.technologies.length > 0 && (
          <DetailSection label="Compatibilidade com suas skills">
            <SkillCompatibility technologies={job.technologies} userSkills={userSkills} />
          </DetailSection>
        )}

        {job.requirements.length > 0 && (
          <DetailSection label="Requisitos">
            <ul className="space-y-1 text-sm text-[#C4C7D0]">
              {job.requirements.map((req, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#378ADD]">–</span>
                  {req}
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {job.differentials.length > 0 && (
          <DetailSection label="Diferenciais">
            <ul className="space-y-1 text-sm text-[#C4C7D0]">
              {job.differentials.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#4ADE80]">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {job.questions.length > 0 && (
          <DetailSection label="Perguntas prováveis">
            <ul className="space-y-1 text-sm text-[#C4C7D0]">
              {job.questions.map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#378ADD]">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {job.checklist.length > 0 && (
          <DetailSection label="Checklist">
            <JobChecklist jobId={job.id} items={job.checklist} initialDone={job.checklistDone} />
          </DetailSection>
        )}

        {!monitored && (
          <DetailSection label="Detalhes da candidatura">
            <JobMetaEditor
              jobId={job.id}
              initialUrl={job.url}
              initialLocation={job.location}
              initialSalary={job.salary}
              initialAppliedAt={job.appliedAt}
            />
          </DetailSection>
        )}
      </GlassPanel>
    </>
  );
}
