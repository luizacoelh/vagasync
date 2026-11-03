"use client";

import GlassPanel from "@/components/ui/Glass";
import { IMPORT_LIMITS } from "@/lib/jobImport/types";
import { LABEL_CLASS, MAX_DESCRIPTION_LENGTH, OUTFIT, PRIMARY_BUTTON_CLASS, PRIMARY_BUTTON_STYLE } from "./ui";

// Aba "Colar texto": o fluxo de sempre, mais o link opcional da vaga (o mesmo
// campo "Link da vaga" da prévia), para o link vindo da aba Link não se perder.
export default function TextPanel({
  description,
  onDescriptionChange,
  url,
  onUrlChange,
  onExample,
  onAnalyze,
  isAnalyzing,
}: {
  description: string;
  onDescriptionChange: (text: string) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onExample: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}) {
  return (
    <GlassPanel plateClassName="p-6">
      <label htmlFor="description" className={LABEL_CLASS} style={OUTFIT}>
        Descrição da vaga
      </label>
      <textarea
        id="description"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Cole aqui o texto da vaga — pode ser do LinkedIn, Gupy, Indeed, site da empresa ou qualquer outro lugar."
        rows={12}
        maxLength={MAX_DESCRIPTION_LENGTH}
        className="glass-input mt-2 w-full rounded-xl px-4 py-3 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C] resize-none"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onExample}
          className="text-xs text-[#85B7EB] hover:text-[#378ADD] transition-colors"
          style={OUTFIT}
        >
          Ver como funciona com uma vaga de exemplo
        </button>
        <span className="text-xs text-[#7C8494] shrink-0">
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </span>
      </div>

      <label htmlFor="text-url" className={`${LABEL_CLASS} mt-5`} style={OUTFIT}>
        Link da vaga (opcional)
      </label>
      <input
        id="text-url"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://..."
        maxLength={IMPORT_LIMITS.urlChars}
        className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
      />

      <button
        type="button"
        onClick={onAnalyze}
        disabled={isAnalyzing}
        className={`${PRIMARY_BUTTON_CLASS} mt-4 w-full`}
        style={PRIMARY_BUTTON_STYLE}
      >
        {isAnalyzing ? "Analisando..." : "Analisar"}
      </button>
    </GlassPanel>
  );
}
