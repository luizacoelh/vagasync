"use client";

import type { FormEvent } from "react";
import GlassPanel from "@/components/ui/Glass";
import { IMPORT_LIMITS } from "@/lib/jobImport/types";
import { ImportConfirm, ImportDuplicate, ImportFallback } from "./ImportResult";
import type { LinkResult } from "./useLinkImport";
import { LABEL_CLASS, OUTFIT, PRIMARY_BUTTON_CLASS, PRIMARY_BUTTON_STYLE } from "./ui";

// Aba "Link da vaga": campo do link sempre visível e, abaixo, o resultado da
// busca (confirmação, duplicada ou alternativa de colar o texto).
export default function LinkPanel({
  link,
  onLinkChange,
  onFetch,
  isFetching,
  result,
  hint,
  onExample,
  onConfirmTextChange,
  onAnalyze,
  onPasteText,
  isAnalyzing,
}: {
  link: string;
  onLinkChange: (link: string) => void;
  onFetch: () => void;
  isFetching: boolean;
  result: LinkResult;
  hint: string | null;
  // Só para o visitante: preenche o link de exemplo (lib/demoJobs.ts).
  onExample?: () => void;
  onConfirmTextChange: (texto: string) => void;
  onAnalyze: () => void;
  // url: link a levar para a aba de texto.
  onPasteText: (url: string) => void;
  isAnalyzing: boolean;
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onFetch();
  }

  const invalid = result.kind === "invalido";

  return (
    <div className="space-y-4">
      <GlassPanel plateClassName="p-6">
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="import-url" className={LABEL_CLASS} style={OUTFIT}>
            Link da vaga
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="import-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={link}
              onChange={(e) => onLinkChange(e.target.value)}
              placeholder="https://..."
              maxLength={IMPORT_LIMITS.urlChars}
              aria-invalid={invalid || undefined}
              aria-describedby={`import-url-ajuda${invalid ? " import-url-erro" : ""}${hint ? " import-url-dica" : ""}`}
              className="glass-input min-w-0 flex-1 rounded-xl px-4 py-3 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
            />
            <button
              type="submit"
              disabled={isFetching || isAnalyzing}
              className={`${PRIMARY_BUTTON_CLASS} px-5 sm:shrink-0`}
              style={PRIMARY_BUTTON_STYLE}
            >
              {isFetching ? "Buscando..." : "Buscar vaga"}
            </button>
          </div>

          {hint && (
            <p
              id="import-url-dica"
              role="status"
              className="mt-3 rounded-xl border border-[#378ADD]/30 bg-[#378ADD]/10 px-3 py-2 text-sm text-[#B5D3F2]"
            >
              {hint}
            </p>
          )}
          {invalid && (
            <p id="import-url-erro" role="alert" className="mt-2 text-sm text-[#E5534B]">
              {result.error}
            </p>
          )}

          <p id="import-url-ajuda" className="mt-3 text-xs leading-relaxed text-[#7C8494]">
            Funciona com links da Gupy, do Remotar, de sites de empresas e outros. LinkedIn, Indeed,
            Glassdoor e Catho não permitem leitura automática: nesses, use a aba Colar texto.
          </p>

          {onExample && (
            <button
              type="button"
              onClick={onExample}
              className="mt-2 text-xs text-[#85B7EB] hover:text-[#378ADD] transition-colors"
              style={OUTFIT}
            >
              Ver como funciona com um link de exemplo
            </button>
          )}
        </form>
      </GlassPanel>

      {result.kind === "ok" && (
        <ImportConfirm
          vaga={result.vaga}
          texto={result.texto}
          onTextoChange={onConfirmTextChange}
          onAnalyze={onAnalyze}
          onPasteText={() => onPasteText(result.vaga.urlFinal)}
          isAnalyzing={isAnalyzing}
        />
      )}

      {result.kind === "duplicada" && <ImportDuplicate jobId={result.jobId} />}

      {result.kind === "colar_texto" && (
        <ImportFallback
          title="Não consegui ler esta página"
          message={result.mensagem}
          onPasteText={() => onPasteText(result.url)}
        />
      )}

      {result.kind === "erro" && (
        <ImportFallback
          title="Não foi possível buscar a vaga"
          message={result.error}
          onPasteText={() => onPasteText(result.url)}
        />
      )}
    </div>
  );
}
