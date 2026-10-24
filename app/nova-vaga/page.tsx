"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JobAnalysis, JobLocation } from "@/types/job";
import { LOCATION_LABELS } from "@/lib/jobLocation";
import { createJob } from "@/app/actions/jobs";
import DetailSection from "@/components/ui/DetailSection";
import TechBadge from "@/components/ui/TechBadge";
import ChecklistItem from "@/components/job/ChecklistItem";
import GlassPanel from "@/components/ui/Glass";
import BackButton from "@/components/ui/BackButton";

type Step = "input" | "preview";

// Mesmo limite validado no servidor (app/api/analyze/route.ts) — aqui é só
// pra dar feedback imediato, o servidor sempre revalida.
const MAX_DESCRIPTION_LENGTH = 8000;

// Vaga de exemplo para quem quer testar sem ter uma vaga em mãos.
// Texto realista de uma vaga de estágio em desenvolvimento web.
const EXAMPLE_JOB = `Estágio em Desenvolvimento Web — Empresa Exemplo Tecnologia

Sobre a vaga:
Buscamos estudantes de TI, Ciência da Computação, Engenharia de Software ou áreas relacionadas para integrar nosso time de produto como estagiário(a) de desenvolvimento web.

Responsabilidades:
- Desenvolver e manter funcionalidades no frontend e backend das nossas aplicações
- Participar de code reviews e reuniões de planejamento de sprint
- Colaborar com o time de design para implementar interfaces responsivas
- Escrever testes automatizados para as funcionalidades desenvolvidas

Requisitos:
- Cursando graduação em área de TI (a partir do 3º semestre)
- Conhecimento em HTML, CSS e JavaScript
- Noções de React ou outro framework frontend
- Familiaridade com Git e fluxo de trabalho em equipe

Diferenciais:
- Experiência com TypeScript
- Conhecimento em Node.js ou Python no backend
- Experiência com banco de dados SQL

O que oferecemos:
- Bolsa-auxílio compatível com o mercado
- Vale-refeição e vale-transporte
- Modelo híbrido (2x presencial por semana)
- Mentoria com desenvolvedores seniores
- Possibilidade de efetivação

Carga horária: 30h semanais
Local: São Paulo, SP (híbrido)`;

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NovaVagaPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("input");
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);

  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState<JobLocation>("NAO_INFORMADO");
  const [salary, setSalary] = useState("");
  const [appliedAt, setAppliedAt] = useState(todayInputValue());

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setError(null);

    if (description.trim().length < 20) {
      setError("Cole a descrição completa da vaga (texto muito curto).");
      return;
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      setError(`Descrição muito longa (${description.length}/${MAX_DESCRIPTION_LENGTH} caracteres).`);
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível analisar a vaga.");
        return;
      }

      setAnalysis(data as JobAnalysis);
      setCompany(data.company);
      setTitle(data.title);
      setSummary(data.summary);
      setStep("preview");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!analysis) return;
    setError(null);
    setIsSaving(true);

    try {
      const result = await createJob({
        description,
        company,
        title,
        summary,
        requirements: analysis.requirements,
        technologies: analysis.technologies,
        questions: analysis.questions,
        checklist: analysis.checklist,
        url: url.trim() === "" ? undefined : url.trim(),
        location,
        salary: salary.trim() === "" ? undefined : salary.trim(),
        appliedAt,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/vaga/${result.id}?created=true`);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleBack() {
    setStep("input");
    setAnalysis(null);
    setCompany("");
    setTitle("");
    setSummary("");
    setUrl("");
    setLocation("NAO_INFORMADO");
    setSalary("");
    setAppliedAt(todayInputValue());
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
          <div className="mb-6 rounded-xl border border-[#E5534B]/40 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
            {error}
          </div>
        )}

        {step === "input" && (
          <GlassPanel plateClassName="p-6">
            <label
              htmlFor="description"
              className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Descrição da vaga
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cole aqui o texto da vaga — pode ser do LinkedIn, Gupy, Indeed, site da empresa ou qualquer outro lugar."
              rows={12}
              maxLength={MAX_DESCRIPTION_LENGTH}
              className="glass-input mt-2 w-full rounded-xl px-4 py-3 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C] resize-none"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDescription(EXAMPLE_JOB)}
                className="text-xs text-[#85B7EB] hover:text-[#378ADD] transition-colors"
                style={{ fontFamily: "var(--font-outfit)" }}
              >
                Ver como funciona com uma vaga de exemplo
              </button>
              <span className="text-xs text-[#7C8494] shrink-0">
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </span>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="mt-4 w-full rounded-xl py-3 font-medium text-[#08131F] transition-shadow disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                fontFamily: "var(--font-outfit)",
                background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
              }}
            >
              {isAnalyzing ? "Analisando..." : "Analisar"}
            </button>
          </GlassPanel>
        )}

        {step === "preview" && analysis && (
          <div className="space-y-4">
            <GlassPanel plateClassName="p-6 space-y-4">
              <div>
                <label
                  htmlFor="company"
                  className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                  style={{ fontFamily: "var(--font-outfit)" }}
                >
                  Empresa
                </label>
                <input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB]"
                />
              </div>

              <div>
                <label
                  htmlFor="title"
                  className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                  style={{ fontFamily: "var(--font-outfit)" }}
                >
                  Cargo
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB]"
                />
              </div>

              <div>
                <label
                  htmlFor="summary"
                  className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                  style={{ fontFamily: "var(--font-outfit)" }}
                >
                  Resumo
                </label>
                <textarea
                  id="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#C4C7D0] leading-relaxed resize-none"
                />
              </div>

              <div>
                <label
                  htmlFor="url"
                  className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                  style={{ fontFamily: "var(--font-outfit)" }}
                >
                  Link da vaga (opcional)
                </label>
                <input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="location"
                    className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                    style={{ fontFamily: "var(--font-outfit)" }}
                  >
                    Local
                  </label>
                  <select
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value as JobLocation)}
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
                  <label
                    htmlFor="salary"
                    className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                    style={{ fontFamily: "var(--font-outfit)" }}
                  >
                    Salário
                  </label>
                  <input
                    id="salary"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="Não informado"
                    className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4B4F5C]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="appliedAt"
                    className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
                    style={{ fontFamily: "var(--font-outfit)" }}
                  >
                    Data da candidatura
                  </label>
                  <input
                    id="appliedAt"
                    type="date"
                    value={appliedAt}
                    onChange={(e) => setAppliedAt(e.target.value)}
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
                onClick={handleBack}
                disabled={isSaving}
                className="glass-btn flex-1 rounded-xl py-3 font-medium text-[#C4C7D0] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: "var(--font-outfit)" }}
              >
                Voltar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 rounded-xl py-3 font-medium text-[#08131F] transition-shadow disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  fontFamily: "var(--font-outfit)",
                  background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
                }}
              >
                {isSaving ? "Salvando..." : "Salvar vaga"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
