"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExperienceLevel } from "@prisma/client";
import { EXPERIENCE_LABELS } from "@/lib/experienceLevel";
import { UserProfile } from "@/types/profile";
import GlassPanel from "@/components/ui/Glass";

export default function ProfileForm({
  initialProfile,
  isOnboarding,
  usedToday = 0,
  dailyLimit = 10,
}: {
  initialProfile: UserProfile | null;
  isOnboarding: boolean;
  usedToday?: number;
  dailyLimit?: number;
}) {
  const router = useRouter();

  const [goal, setGoal] = useState(initialProfile?.goal ?? "");
  const [interestArea, setInterestArea] = useState(initialProfile?.interestArea ?? "");
  const [experience, setExperience] = useState<ExperienceLevel>(
    initialProfile?.experience ?? "NAO_INFORMADO"
  );
  const [skillsText, setSkillsText] = useState((initialProfile?.skills ?? []).join(", "));

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    const skills = skillsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, interestArea, experience, skills }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar o perfil.");
        return;
      }

      if (isOnboarding) {
        router.push("/");
        return;
      }

      setToast("Perfil salvo.");
      router.refresh();
      setTimeout(() => setToast(null), 2500);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <GlassPanel plateClassName="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-xl border border-[#E5534B]/30 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="goal"
              className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Objetivo profissional
            </label>
            <input
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex: conseguir um estágio em desenvolvimento web"
              className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4A5060]"
            />
          </div>

          <div>
            <label
              htmlFor="interestArea"
              className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Área de interesse
            </label>
            <input
              id="interestArea"
              value={interestArea}
              onChange={(e) => setInterestArea(e.target.value)}
              placeholder="Ex: Backend, Dados, QA"
              className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4A5060]"
            />
          </div>

          <div>
            <label
              htmlFor="experience"
              className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Nível de experiência
            </label>
            <select
              id="experience"
              value={experience}
              onChange={(e) => setExperience(e.target.value as ExperienceLevel)}
              className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB]"
            >
              {Object.entries(EXPERIENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="skills"
              className="block text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Suas skills
            </label>
            <input
              id="skills"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="Java, Git, SQL"
              className="glass-input w-full rounded-xl px-4 py-2.5 text-sm text-[#E4E6EB] placeholder:text-[#4A5060]"
            />
            <p className="mt-1.5 text-xs text-[#4A5060]">
              Separe por vírgula. Usadas para comparar com as tecnologias pedidas em cada vaga.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4FA0F0] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              {isSaving ? "Salvando..." : isOnboarding ? "Salvar e continuar" : "Salvar alterações"}
            </button>
            {toast && (
              <span className="text-xs text-[#3FB950]" style={{ fontFamily: "var(--font-outfit)" }}>
                {toast}
              </span>
            )}
          </div>
        </form>
      </GlassPanel>

      {/* Contador de uso de IA — só aparece fora do onboarding */}
      {!isOnboarding && (
        <GlassPanel plateClassName="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                className="text-sm font-medium text-[#C4C7D0]"
                style={{ fontFamily: "var(--font-outfit)" }}
              >
                Análises de IA hoje
              </p>
              <p className="text-xs text-[#7C8494] mt-0.5">
                Reinicia automaticamente a cada 24 horas.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className="text-lg font-semibold"
                style={{
                  fontFamily: "var(--font-outfit)",
                  color: usedToday >= dailyLimit ? "#E5534B" : usedToday >= dailyLimit * 0.8 ? "#F0B429" : "#4ADE80",
                }}
              >
                {usedToday}/{dailyLimit}
              </p>
              <p className="text-xs text-[#7C8494]">
                {usedToday >= dailyLimit ? "Limite atingido" : `${dailyLimit - usedToday} restante${dailyLimit - usedToday !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          {/* Barra de progresso */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((usedToday / dailyLimit) * 100, 100)}%`,
                background: usedToday >= dailyLimit
                  ? "#E5534B"
                  : usedToday >= dailyLimit * 0.8
                  ? "#F0B429"
                  : "linear-gradient(90deg, #378ADD, #85B7EB)",
              }}
            />
          </div>
        </GlassPanel>
      )}

      {/* Exportar CSV — só aparece fora do onboarding, onde já há vagas cadastradas */}
      {!isOnboarding && (
        <GlassPanel plateClassName="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p
                className="text-sm font-medium text-[#C4C7D0]"
                style={{ fontFamily: "var(--font-outfit)" }}
              >
                Exportar candidaturas
              </p>
              <p className="text-xs text-[#7C8494] mt-0.5">
                Baixa todas as suas vagas em formato CSV.
              </p>
            </div>
            <a
              href="/api/jobs/export"
              className="glass-btn shrink-0 rounded-xl px-4 py-2 text-xs font-medium text-[#C4C7D0]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Exportar CSV
            </a>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
