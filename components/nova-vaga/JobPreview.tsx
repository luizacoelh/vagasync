"use client";

import type { JobAnalysis, JobLocation } from "@/types/job";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import DetailSection from "@/components/ui/DetailSection";
import TechBadge from "@/components/ui/TechBadge";
import ChecklistItem from "@/components/job/ChecklistItem";
import GlassPanel from "@/components/ui/Glass";
import { LABEL_CLASS, OUTFIT, PRIMARY_BUTTON_CLASS, PRIMARY_BUTTON_STYLE, SECONDARY_BUTTON_CLASS } from "./ui";

// Campos editáveis da prévia. url é o mesmo estado do "Link da vaga" da aba
// de texto e chega preenchido com o urlFinal quando a vaga veio pelo link.
export type PreviewFields = {
  company: string;
  title: string;
  summary: string;
  url: string;
  location: JobLocation;
  salary: string;
  appliedAt: string;
};

export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyPreviewFields(url = ""): PreviewFields {
  return {
    company: "",
    title: "",
    summary: "",
    url,
    location: "NAO_INFORMADO",
    salary: "",
    appliedAt: todayInputValue(),
  };
}

export default function JobPreview({
  analysis,
  fields,
  onFieldChange,
  onBack,
  onSave,
  isSaving,
}: {
  analysis: JobAnalysis;
  fields: PreviewFields;
  onFieldChange: <K extends keyof PreviewFields>(field: K, value: PreviewFields[K]) => void;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="space-y-4">
      <GlassPanel plateClassName="p-6 space-y-4">
        <div>
          <label htmlFor="company" className={LABEL_CLASS} style={OUTFIT}>
            Empresa
          </label>
          <input
            id="company"
            value={fields.company}
            onChange={(e) => onFieldChange("company", e.target.value)}
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB]"
          />
        </div>

        <div>
          <label htmlFor="title" className={LABEL_CLASS} style={OUTFIT}>
            Cargo
          </label>
          <input
            id="title"
            value={fields.title}
            onChange={(e) => onFieldChange("title", e.target.value)}
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB]"
          />
        </div>

        <div>
          <label htmlFor="summary" className={LABEL_CLASS} style={OUTFIT}>
            Resumo
          </label>
          <textarea
            id="summary"
            value={fields.summary}
            onChange={(e) => onFieldChange("summary", e.target.value)}
            rows={4}
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#C4C7D0] leading-relaxed resize-none"
          />
        </div>

        <div>
          <label htmlFor="url" className={LABEL_CLASS} style={OUTFIT}>
            Link da vaga (opcional)
          </label>
          <input
            id="url"
            value={fields.url}
            onChange={(e) => onFieldChange("url", e.target.value)}
            placeholder="https://..."
            className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="location" className={LABEL_CLASS} style={OUTFIT}>
              Local
            </label>
            <select
              id="location"
              value={fields.location}
              onChange={(e) => onFieldChange("location", e.target.value as JobLocation)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            >
              {Object.entries(LOCATION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="salary" className={LABEL_CLASS} style={OUTFIT}>
              Salário / bolsa
            </label>
            <input
              id="salary"
              value={fields.salary}
              onChange={(e) => onFieldChange("salary", e.target.value)}
              placeholder="Não informado"
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
            />
          </div>

          <div>
            <label htmlFor="appliedAt" className={LABEL_CLASS} style={OUTFIT}>
              Data da candidatura
            </label>
            <input
              id="appliedAt"
              type="date"
              value={fields.appliedAt}
              onChange={(e) => onFieldChange("appliedAt", e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>
        </div>

        <DetailSection label="Tecnologias">
          <div className="flex flex-wrap gap-2">
            {analysis.technologies.map((tech) => (
              <TechBadge key={tech} tech={tech} />
            ))}
          </div>
        </DetailSection>

        <DetailSection label="Requisitos">
          <ul className="space-y-1 text-sm text-[#C4C7D0]">
            {analysis.requirements.map((req, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#378ADD]">–</span>
                {req}
              </li>
            ))}
          </ul>
        </DetailSection>

        {analysis.differentials.length > 0 && (
          <DetailSection label="Diferenciais">
            <ul className="space-y-1 text-sm text-[#C4C7D0]">
              {analysis.differentials.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#4ADE80]">+</span>
                  {item}
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        <DetailSection label="Perguntas prováveis">
          <ul className="space-y-1 text-sm text-[#C4C7D0]">
            {analysis.questions.map((q, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-[#378ADD]">?</span>
                {q}
              </li>
            ))}
          </ul>
        </DetailSection>

        <DetailSection label="Checklist">
          <ul className="space-y-1">
            {analysis.checklist.map((item, i) => (
              <ChecklistItem key={i} text={item} />
            ))}
          </ul>
        </DetailSection>
      </GlassPanel>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isSaving}
          className={`${SECONDARY_BUTTON_CLASS} flex-1`}
          style={OUTFIT}
        >
          Voltar
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className={`${PRIMARY_BUTTON_CLASS} flex-1`}
          style={PRIMARY_BUTTON_STYLE}
        >
          {isSaving ? "Salvando..." : "Salvar vaga"}
        </button>
      </div>
    </div>
  );
}
