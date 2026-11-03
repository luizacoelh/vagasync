"use client";

import Link from "next/link";
import GlassPanel from "@/components/ui/Glass";
import type { ImportAviso, ImportedJob } from "@/lib/jobImport/types";
import {
  LABEL_CLASS,
  MAX_DESCRIPTION_LENGTH,
  OUTFIT,
  PRIMARY_BUTTON_CLASS,
  PRIMARY_BUTTON_STYLE,
  SECONDARY_BUTTON_CLASS,
} from "./ui";

const AVISO_TEXT: Record<ImportAviso, string> = {
  texto_incompleto: "O texto parece incompleto — confira ou cole o texto da vaga.",
  texto_cortado: "O texto era longo e foi cortado no limite.",
};

// Confirmação "É esta vaga?": a IA só roda depois do clique em "Analisar com IA".
export function ImportConfirm({
  vaga,
  texto,
  onTextoChange,
  onAnalyze,
  onPasteText,
  isAnalyzing,
}: {
  vaga: ImportedJob;
  texto: string;
  onTextoChange: (texto: string) => void;
  onAnalyze: () => void;
  onPasteText: () => void;
  isAnalyzing: boolean;
}) {
  const details = [
    { label: "Cargo", value: vaga.titulo },
    { label: "Empresa", value: vaga.empresa },
    { label: "Site", value: vaga.site },
  ].filter((d): d is { label: string; value: string } => Boolean(d.value));

  return (
    <GlassPanel plateClassName="p-6 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-[#7C8494]" style={OUTFIT}>
          Confira antes da análise
        </p>
        <h2 className="text-lg font-semibold text-[#E4E6EB]" style={OUTFIT}>
          É esta vaga?
        </h2>
      </div>

      {details.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-3">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-[#7C8494]" style={OUTFIT}>
                {d.label}
              </dt>
              <dd className="break-words text-sm text-[#E4E6EB]">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {vaga.avisos.length > 0 && (
        <ul className="space-y-2">
          {vaga.avisos.map((aviso) => (
            <li
              key={aviso}
              className="rounded-xl border border-[#F0B429]/35 bg-[#F0B429]/10 px-4 py-2.5 text-sm text-[#F0B429]"
            >
              {AVISO_TEXT[aviso]}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="import-text" className={LABEL_CLASS} style={OUTFIT}>
          Texto da vaga
        </label>
        <textarea
          id="import-text"
          value={texto}
          onChange={(e) => onTextoChange(e.target.value)}
          rows={12}
          maxLength={MAX_DESCRIPTION_LENGTH}
          className="glass-input w-full rounded-xl px-4 py-3 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C] resize-none"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-xs text-[#7C8494]">Pode editar: é este texto que a IA vai analisar.</span>
          <span className="text-xs text-[#7C8494] shrink-0">
            {texto.length}/{MAX_DESCRIPTION_LENGTH}
          </span>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onPasteText}
          disabled={isAnalyzing}
          className={`${SECONDARY_BUTTON_CLASS} flex-1 px-4`}
          style={OUTFIT}
        >
          Não é isso — colar o texto
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className={`${PRIMARY_BUTTON_CLASS} flex-1 px-4`}
          style={PRIMARY_BUTTON_STYLE}
        >
          {isAnalyzing ? "Analisando..." : "Analisar com IA"}
        </button>
      </div>
    </GlassPanel>
  );
}

export function ImportDuplicate({ jobId }: { jobId: string }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-[#378ADD]/30 bg-[#378ADD]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-[#B5D3F2]">Você já cadastrou esta vaga.</p>
      <Link
        href={`/vaga/${encodeURIComponent(jobId)}`}
        className="glass-btn shrink-0 rounded-xl px-4 py-2 text-center text-sm font-medium text-[#E4E6EB]"
        style={OUTFIT}
      >
        Abrir a vaga
      </Link>
    </div>
  );
}

// Estado "não consegui ler esta página" (e erros da rota): sempre oferece a
// aba de texto com o link preenchido, nunca um erro genérico sem saída.
export function ImportFallback({
  title,
  message,
  onPasteText,
}: {
  title: string;
  message: string;
  onPasteText: () => void;
}) {
  return (
    <GlassPanel plateClassName="p-6" hotspots={false}>
      <div role="alert" className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#F0B429]"
          style={{
            background: "linear-gradient(155deg, rgba(240,180,41,0.18), rgba(240,180,41,0.06))",
            boxShadow: "inset 0 0 0 1px rgba(240,180,41,0.3)",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9.5 12.5l5 5M14.5 12.5l-5 5" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[#E4E6EB]" style={OUTFIT}>
            {title}
          </h2>
          <p className="mt-1 text-sm text-[#A9B2C0]">{message}</p>
          <p className="mt-1 text-xs text-[#7C8494]">
            Copie o texto da vaga na página e cole na aba de texto. O link vai junto com a vaga.
          </p>
          <button
            type="button"
            onClick={onPasteText}
            className={`${PRIMARY_BUTTON_CLASS} mt-4 w-full px-5 sm:w-auto`}
            style={PRIMARY_BUTTON_STYLE}
          >
            Colar texto
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}
