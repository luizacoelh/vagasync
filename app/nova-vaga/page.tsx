"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobAnalysis } from "@/types/job";
import { createJob } from "@/app/actions/jobs";
import BackButton from "@/components/ui/BackButton";
import { useLoginGate } from "@/components/auth/LoginGate";
import { EXAMPLE_ANALYSIS, EXAMPLE_IMPORT, EXAMPLE_IMPORT_URL, EXAMPLE_JOB } from "@/lib/demoJobs";
import InputTabs, { panelId, tabId, type InputTab } from "@/components/nova-vaga/InputTabs";
import { ackExtensionCapture, useExtensionCapture } from "@/components/nova-vaga/useExtensionCapture";
import { CAPTURE_METHOD_LABEL, type ExtensionCapture } from "@/lib/extensionCapture";
import LinkPanel from "@/components/nova-vaga/LinkPanel";
import TextPanel from "@/components/nova-vaga/TextPanel";
import JobPreview, { emptyPreviewFields, type PreviewFields } from "@/components/nova-vaga/JobPreview";
import { isOnlyLink, okResult, useLinkImport, validateImportUrl } from "@/components/nova-vaga/useLinkImport";
import { MAX_DESCRIPTION_LENGTH } from "@/components/nova-vaga/ui";

// Fluxo de /nova-vaga:
// - aba "Link da vaga" (padrão): POST /api/vaga/importar → "É esta vaga?" com o
//   texto editável → /api/analyze → prévia, com o urlFinal no "Link da vaga";
// - aba "Colar texto": o fluxo de sempre, com o link opcional da vaga.
// Nada é gravado antes de "Salvar vaga" (createJob).

type Step = "input" | "preview";

// Rascunho de um visitante que clicou em Buscar/Analisar/Salvar: o login sai
// do site (Google/GitHub), então o que ele digitou fica guardado na aba e
// volta aqui. Uma chave por campo: texto, link da aba de texto e link da aba Link.
const DRAFT_KEY = "vagasync:nova-vaga-rascunho";
const DRAFT_URL_KEY = "vagasync:nova-vaga-rascunho-link";
const LINK_DRAFT_KEY = "vagasync:nova-vaga-link";

const LINK_HINT = "Isso é um link — busque a vaga por aqui.";

function takeDraft(key: string): string | null {
  const value = sessionStorage.getItem(key);
  if (value !== null) sessionStorage.removeItem(key);
  return value;
}

function saveDraft(entries: Record<string, string>) {
  try {
    for (const [key, value] of Object.entries(entries)) {
      if (value) sessionStorage.setItem(key, value);
    }
  } catch {
    // sem sessionStorage o rascunho só não volta depois do login
  }
}

// O link de exemplo não existe de verdade: não vai junto para depois do login.
function draftableUrl(url: string): string {
  const value = url.trim();
  return value === EXAMPLE_IMPORT_URL ? "" : value;
}

export default function NovaVagaPage() {
  const router = useRouter();
  const { isGuest, requireLogin } = useLoginGate();
  const { link, setLink, result, setResult, isFetching, fetchJob, setConfirmText } = useLinkImport();

  const [tab, setTab] = useState<InputTab>("texto");
  const [step, setStep] = useState<Step>("input");
  const [description, setDescription] = useState("");
  const [linkHint, setLinkHint] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  // Texto que foi para a IA (da aba de texto ou da confirmação do link); é o
  // que vai como descrição para createJob.
  const [analyzedText, setAnalyzedText] = useState("");
  const [fields, setFields] = useState<PreviewFields>(() => emptyPreviewFields());

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [captured, setCaptured] = useState<ExtensionCapture | null>(null);
  const [pendingCapture, setPendingCapture] = useState<ExtensionCapture | null>(null);

  function applyCapture(capture: ExtensionCapture) {
    setDescription(capture.text);
    if (capture.url) setFields((f) => ({ ...f, url: capture.url ?? f.url }));
    setTab("texto");
    setError(null);
    setCaptured(capture);
    setPendingCapture(null);
  }

  // Vaga lida pela extensão do navegador (extension/): preenche a aba de texto
  // para a pessoa conferir e analisar. Não chama a IA sozinha. Se já houver
  // texto ou link na tela (rascunho restaurado depois do login, por exemplo),
  // não sobrescreve: oferece a troca.
  useExtensionCapture(!isGuest && step === "input", (capture) => {
    if (description.trim() || link.trim()) {
      setPendingCapture(capture);
      return false;
    }
    applyCapture(capture);
    return true;
  });

  // Depois do login, devolve o que o visitante tinha digitado.
  useEffect(() => {
    if (isGuest) return;
    try {
      const draft = takeDraft(DRAFT_KEY);
      const draftUrl = takeDraft(DRAFT_URL_KEY);
      const draftLink = takeDraft(LINK_DRAFT_KEY);
      /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage só existe no cliente */
      if (draft) setDescription(draft);
      if (draftUrl) setFields((f) => ({ ...f, url: draftUrl }));
      if (draftLink) {
        setLink(draftLink);
        setTab("link");
      } else if (draft || draftUrl) {
        setTab("texto");
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // sessionStorage bloqueado: segue sem rascunho
    }
  }, [isGuest, setLink]);

  // O erro fica no topo; na confirmação do link o botão pode estar bem abaixo.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  function setField<K extends keyof PreviewFields>(field: K, value: PreviewFields[K]) {
    setFields((f) => ({ ...f, [field]: value }));
  }

  function handleTabChange(next: InputTab) {
    setTab(next);
    setError(null);
  }

  function applyAnalysis(data: JobAnalysis, text: string, url?: string) {
    setAnalysis(data);
    setAnalyzedText(text);
    setFields((f) => ({
      ...f,
      company: data.company,
      title: data.title,
      summary: data.summary,
      // Pré-preenche com o que a IA achou no texto — continua editável.
      salary: data.salary ?? "",
      location: data.location ?? "NAO_INFORMADO",
      ...(url !== undefined && { url }),
    }));
    setStep("preview");
  }

  // url: link que vai para a prévia (o urlFinal, quando a vaga veio pelo link).
  async function analyze(text: string, url?: string) {
    setError(null);

    if (text.trim().length < 20) {
      setError("Cole a descrição completa da vaga (texto muito curto).");
      return;
    }

    if (text.length > MAX_DESCRIPTION_LENGTH) {
      setError(`Descrição muito longa (${text.length}/${MAX_DESCRIPTION_LENGTH} caracteres).`);
      return;
    }

    // Visitante: a vaga de exemplo (pelo texto ou pelo link de exemplo) mostra
    // uma análise pronta, sem gastar IA; qualquer outro texto pede login.
    if (isGuest && text.trim() === EXAMPLE_JOB.trim()) {
      applyAnalysis(EXAMPLE_ANALYSIS, text, url);
      return;
    }
    if (isGuest) {
      saveDraft({ [DRAFT_KEY]: text, [DRAFT_URL_KEY]: draftableUrl(url ?? fields.url) });
      requireLogin("Entre para a IA analisar esta vaga. O texto que você colou continua aqui.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível analisar a vaga.");
        return;
      }

      applyAnalysis(data as JobAnalysis, text, url);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleAnalyzeText() {
    // Só um link no lugar do texto: a IA leria só o endereço. Leva para a aba Link.
    if (isOnlyLink(description)) {
      setError(null);
      setLink(description.trim());
      setResult({ kind: "idle" });
      setDescription("");
      setTab("link");
      setLinkHint(LINK_HINT);
      return;
    }
    void analyze(description);
  }

  function handleAnalyzeImported() {
    if (result.kind !== "ok") return;
    void analyze(result.texto, result.vaga.urlFinal);
  }

  async function handleFetch() {
    setError(null);
    setLinkHint(null);

    const invalid = validateImportUrl(link);
    if (invalid) {
      setResult({ kind: "invalido", error: invalid });
      return;
    }
    const value = link.trim();

    if (isGuest && value === EXAMPLE_IMPORT_URL) {
      setResult(okResult(EXAMPLE_IMPORT));
      return;
    }
    if (isGuest) {
      saveDraft({ [LINK_DRAFT_KEY]: value });
      requireLogin("Entre para o VagaSync buscar esta vaga. O link que você colou continua aqui.");
      return;
    }

    await fetchJob(value);
  }

  function handleLinkChange(value: string) {
    setLink(value);
    if (result.kind === "invalido") setResult({ kind: "idle" });
  }

  // Alternativa de colar o texto: aba de texto com o link já no "Link da vaga".
  function handlePasteText(url: string) {
    setError(null);
    setLinkHint(null);
    setField("url", url);
    setTab("texto");
    requestAnimationFrame(() => document.getElementById("description")?.focus());
  }

  async function handleSave() {
    if (!analysis) return;
    if (isGuest) {
      saveDraft({ [DRAFT_KEY]: analyzedText, [DRAFT_URL_KEY]: draftableUrl(fields.url) });
      requireLogin("Entre para salvar a vaga e acompanhar a candidatura.");
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const url = fields.url.trim();
      const salary = fields.salary.trim();
      const saved = await createJob({
        description: analyzedText,
        company: fields.company,
        title: fields.title,
        summary: fields.summary,
        requirements: analysis.requirements,
        differentials: analysis.differentials,
        technologies: analysis.technologies,
        questions: analysis.questions,
        checklist: analysis.checklist,
        url: url === "" ? undefined : url,
        location: fields.location,
        salary: salary === "" ? undefined : salary,
        appliedAt: fields.appliedAt,
      });

      if ("error" in saved) {
        setError(saved.error);
        return;
      }

      router.push(`/vaga/${saved.id}?created=true`);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  // Volta para a aba de onde veio (a confirmação do link continua lá). O link
  // da vaga não é apagado.
  function handleBack() {
    setStep("input");
    setAnalysis(null);
    setFields((f) => emptyPreviewFields(f.url));
    setError(null);
  }

  return (
    <main className="min-h-screen text-[#E4E6EB] flex justify-center px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(55,138,221,0.5), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 420, height: 420, bottom: -160, right: -100, background: "radial-gradient(circle, rgba(133,183,235,0.3), transparent 70%)" }} />
      </div>

      <div className="w-full max-w-2xl">
        <div className="mb-4">
          <BackButton href="/" />
        </div>

        {/* Wordmark + título — sem label de etapa */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="h-[18px] w-[18px] rounded-[6px] shrink-0"
            style={{
              background: "linear-gradient(155deg, #85B7EB, #378ADD)",
              boxShadow: "0 0 10px rgba(55,138,221,0.5), inset 0 1px 1px rgba(255,255,255,0.45)",
            }}
          />
          <span
            className="text-sm font-semibold text-[#85B7EB]"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            VagaSync
          </span>
        </div>
        <h1 className="text-2xl font-semibold mb-8" style={{ fontFamily: "var(--font-outfit)" }}>
          {step === "input" ? "Adicionar vaga" : "Confirmar análise"}
        </h1>

        {error && (
          <div
            ref={errorRef}
            role="alert"
            className="mb-6 scroll-mt-4 rounded-xl border border-[#E5534B]/40 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]"
          >
            {error}
          </div>
        )}

        {step === "input" && captured && !pendingCapture && (
          <div className="mb-4 rounded-xl border border-[#378ADD]/35 bg-[#378ADD]/10 px-4 py-3 text-sm text-[#C4C7D0] space-y-1">
            <p>
              Vaga trazida pela extensão
              {captured.method ? `, ${CAPTURE_METHOD_LABEL[captured.method]}` : ""} (
              {captured.text.length.toLocaleString("pt-BR")} caracteres). Confira o texto, apague o que não for da
              vaga e clique em Analisar.
            </p>
            {(captured.method === "pagina" || captured.truncated) && (
              <p className="text-[#E3B341]">
                {captured.truncated ? "O texto passou do limite e foi cortado no fim. " : ""}
                {captured.method === "pagina"
                  ? "Não achei o bloco da vaga e peguei a página toda. "
                  : ""}
                Para um resultado melhor, selecione na página só o texto da vaga e clique no ícone de novo.
              </p>
            )}
          </div>
        )}

        {step === "input" && pendingCapture && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#378ADD]/35 bg-[#378ADD]/10 px-4 py-3 text-sm text-[#C4C7D0]">
            <span className="flex-1">A extensão trouxe uma vaga, mas já há um texto aqui. Ele foi mantido.</span>
            <button
              type="button"
              onClick={() => {
                applyCapture(pendingCapture);
                ackExtensionCapture();
              }}
              className="glass-btn rounded-xl px-3.5 py-1.5 text-xs font-medium text-[#E4E6EB]"
            >
              Usar a vaga da extensão
            </button>
          </div>
        )}

        {step === "input" && (
          <>
            <InputTabs tab={tab} onChange={handleTabChange} />

            <div role="tabpanel" id={panelId("link")} aria-labelledby={tabId("link")} hidden={tab !== "link"}>
              <LinkPanel
                link={link}
                onLinkChange={handleLinkChange}
                onFetch={handleFetch}
                isFetching={isFetching}
                result={result}
                hint={linkHint}
                onExample={
                  isGuest
                    ? () => {
                        setLink(EXAMPLE_IMPORT_URL);
                        setResult({ kind: "idle" });
                        setLinkHint(null);
                      }
                    : undefined
                }
                onConfirmTextChange={setConfirmText}
                onAnalyze={handleAnalyzeImported}
                onPasteText={handlePasteText}
                isAnalyzing={isAnalyzing}
              />
            </div>

            <div role="tabpanel" id={panelId("texto")} aria-labelledby={tabId("texto")} hidden={tab !== "texto"}>
              <TextPanel
                description={description}
                onDescriptionChange={setDescription}
                url={fields.url}
                onUrlChange={(value) => setField("url", value)}
                onExample={() => setDescription(EXAMPLE_JOB)}
                onAnalyze={handleAnalyzeText}
                isAnalyzing={isAnalyzing}
              />
            </div>
          </>
        )}

        {step === "preview" && analysis && (
          <JobPreview
            analysis={analysis}
            fields={fields}
            onFieldChange={setField}
            onBack={handleBack}
            onSave={handleSave}
            isSaving={isSaving}
          />
        )}
      </div>
    </main>
  );
}
