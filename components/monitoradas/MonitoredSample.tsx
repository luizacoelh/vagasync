"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { JobLocation } from "@prisma/client";
import GlassPanel from "@/components/ui/Glass";
import TechBadge from "@/components/ui/TechBadge";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { copySampleJob } from "@/app/actions/monitoredSample";

const MAX_TECHS = 5;
const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

export type SampleCard = {
  id: string;
  company: string;
  title: string;
  location: JobLocation;
  salary: string | null;
  summary: string | null;
  technologies: string[];
  url: string | null;
  matches: number;
};

// Amostra de /monitoradas para contas novas (lib/monitoredSample.ts): vagas do
// robô, só leitura. "Tenho interesse" copia a vaga para o dashboard de quem vê.
export default function MonitoredSample({ jobs, hoursLeft }: { jobs: SampleCard[]; hoursLeft: number }) {
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await copySampleJob(id);
      setPendingId(null);
      if ("error" in result) setError(result.error);
      else setSaved((s) => ({ ...s, [id]: result.id }));
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#378ADD]/35 bg-[#378ADD]/10 px-5 py-4 text-sm text-[#C4C7D0]">
        <p className="font-medium text-[#E4E6EB]" style={OUTFIT}>
          Amostra grátis: {hoursLeft === 1 ? "mais 1 hora" : `mais ${hoursLeft} horas`}
        </p>
        <p className="mt-1 text-[#A9B2C0]">
          Estas são vagas de estágio e júnior em tecnologia que o robô do VagaSync encontrou nos últimos
          dias. Marque as que te interessam para levá-las ao seu dashboard. O monitoramento automático
          para a sua conta ainda não está disponível.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-[#E5534B]/40 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <GlassPanel plateClassName="p-8 text-center">
          <p className="text-sm text-[#7C8494]">O robô não encontrou vagas novas nos últimos dias. Volte mais tarde.</p>
        </GlassPanel>
      ) : (
        <GlassPanel plateClassName="divide-y divide-white/8">
          {jobs.map((job) => {
            const extraTechs = job.technologies.length - MAX_TECHS;
            const savedId = saved[job.id];
            return (
              <div key={job.id} className="px-5 py-4">
                <p className="truncate text-xs uppercase tracking-wide text-[#7C8494]" style={OUTFIT}>
                  {job.company}
                </p>
                <h3 className="mt-1 text-base font-medium text-[#E4E6EB]" style={OUTFIT}>
                  {job.title}
                </h3>
                {job.summary && <p className="mt-2 line-clamp-3 text-sm text-[#C4C7D0]">{job.summary}</p>}
                {job.technologies.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.technologies.slice(0, MAX_TECHS).map((tech) => (
                      <TechBadge key={tech} tech={tech} />
                    ))}
                    {extraTechs > 0 && <span className="self-center text-xs text-[#7C8494]">+{extraTechs}</span>}
                  </div>
                )}
                <p className="mt-3 text-xs text-[#7C8494]">
                  {LOCATION_LABELS[job.location]}
                  {job.salary && ` · ${job.salary}`}
                  {job.matches > 0 && ` · ${job.matches} ${job.matches === 1 ? "skill sua" : "skills suas"}`}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {savedId ? (
                    <Link href={`/vaga/${savedId}`} className="text-sm font-medium text-[#85B7EB]" style={OUTFIT}>
                      Salva no seu dashboard · abrir
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => save(job.id)}
                      disabled={pendingId !== null}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-[#08131F] disabled:opacity-50"
                      style={{
                        ...OUTFIT,
                        background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                        boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
                      }}
                    >
                      {pendingId === job.id ? "Salvando..." : "Tenho interesse"}
                    </button>
                  )}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="glass-btn rounded-xl px-3.5 py-2 text-sm text-[#C4C7D0]"
                      style={OUTFIT}
                    >
                      Ver vaga original
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </GlassPanel>
      )}
    </div>
  );
}
