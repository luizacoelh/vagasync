"use client";

// VagaContent é o Client Component que exibe os detalhes de uma vaga.
//
// Estratégia de dados (por ordem de prioridade):
// 1. JobsContext — se o usuário veio do dashboard, os dados já estão em
//    memória. Nesse caso a página aparece INSTANTANEAMENTE, sem skeleton,
//    sem roundtrip ao servidor. É o caso mais comum.
// 2. serverJob (prop) — se o usuário acessou /vaga/[id] diretamente (URL
//    direta, reload, link externo), o Server Component buscou os dados e
//    os passou como prop. A página aparece normalmente após o carregamento.
//
// Em ambos os casos o design é idêntico — o usuário não percebe a diferença.

import { useContext } from "react";
import { Job } from "@/types/job";
import StatusSelect from "@/components/job/StatusSelect";
import JobMetaEditor from "@/components/job/JobMetaEditor";
import DetailSection from "@/components/ui/DetailSection";
import TechBadge from "@/components/ui/TechBadge";
import ChecklistItem from "@/components/job/ChecklistItem";
import SkillCompatibility from "@/components/job/SkillCompatibility";
import DeleteJobButton from "@/components/job/DeleteJobButton";
import GlassPanel from "@/components/ui/Glass";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { useJobs } from "@/lib/JobsContext";

// Hook seguro — não lança se usado fora do provider (ex: acesso direto à URL)
function useSafeJobsContext() {
  try {
    return useJobs();
  } catch {
    return null;
  }
}

export default function VagaContent({
  jobId,
  serverJob,
  serverUserSkills,
}: {
  jobId: string;
  serverJob: Job;
  serverUserSkills: string[];
}) {
  const ctx = useSafeJobsContext();

  // Tenta o contexto primeiro (instantâneo), cai no dado do servidor
  const job = ctx?.getJob(jobId) ?? serverJob;
  const userSkills = serverUserSkills;

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
        <StatusSelect jobId={job.id} initialStatus={job.status} />
      </div>

      <div className="mt-4 flex justify-end">
        <DeleteJobButton jobId={job.id} />
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
            <ul className="space-y-1">
              {job.checklist.map((item, i) => (
                <ChecklistItem key={i} text={item} />
              ))}
            </ul>
          </DetailSection>
        )}

        <DetailSection label="Detalhes da candidatura">
          <JobMetaEditor
            jobId={job.id}
            initialUrl={job.url}
            initialLocation={job.location}
            initialSalary={job.salary}
            initialAppliedAt={job.appliedAt}
          />
        </DetailSection>
      </GlassPanel>
    </>
  );
}
