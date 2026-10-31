"use client";

import { useState } from "react";
import { AppSettings } from "@/lib/appSettings";
import GlassPanel from "@/components/ui/Glass";

export default function AppSettingsForm({ initialSettings }: { initialSettings: AppSettings }) {
  const [dailyAiLimit, setDailyAiLimit] = useState(String(initialSettings.dailyAiLimit));
  const [ipHourlyLimit, setIpHourlyLimit] = useState(String(initialSettings.ipHourlyLimit));
  const [maxDescriptionLength, setMaxDescriptionLength] = useState(
    String(initialSettings.maxDescriptionLength)
  );
  const [newAccountsPerDay, setNewAccountsPerDay] = useState(String(initialSettings.newAccountsPerDay));
  const [globalManualJobsPerDay, setGlobalManualJobsPerDay] = useState(
    String(initialSettings.globalManualJobsPerDay)
  );
  const [globalAiPerDay, setGlobalAiPerDay] = useState(String(initialSettings.globalAiPerDay));
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyAiLimit: Number(dailyAiLimit),
          ipHourlyLimit: Number(ipHourlyLimit),
          maxDescriptionLength: Number(maxDescriptionLength),
          newAccountsPerDay: Number(newAccountsPerDay),
          globalManualJobsPerDay: Number(globalManualJobsPerDay),
          globalAiPerDay: Number(globalAiPerDay),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }

      setToast("Salvo — já vale para a próxima chamada, sem deploy.");
      setTimeout(() => setToast(null), 4000);
    } catch {
      setError("Falha de conexão.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <GlassPanel plateClassName="p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p
          className="text-xs font-medium text-[#7C8494] uppercase tracking-wide"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          Limites globais
        </p>

        {error && (
          <div className="rounded-xl border border-[#E5534B]/30 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="dailyAiLimit"
              className="block text-xs text-[#7C8494] mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Análises de IA por usuário/dia
            </label>
            <input
              id="dailyAiLimit"
              type="number"
              min={1}
              value={dailyAiLimit}
              onChange={(e) => setDailyAiLimit(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>

          <div>
            <label
              htmlFor="ipHourlyLimit"
              className="block text-xs text-[#7C8494] mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Análises por IP/hora
            </label>
            <input
              id="ipHourlyLimit"
              type="number"
              min={1}
              value={ipHourlyLimit}
              onChange={(e) => setIpHourlyLimit(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>

          <div>
            <label
              htmlFor="maxDescriptionLength"
              className="block text-xs text-[#7C8494] mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Tamanho máx. da descrição (chars)
            </label>
            <input
              id="maxDescriptionLength"
              type="number"
              min={100}
              value={maxDescriptionLength}
              onChange={(e) => setMaxDescriptionLength(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>

          <div>
            <label
              htmlFor="newAccountsPerDay"
              className="block text-xs text-[#7C8494] mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Contas novas no site/24h
            </label>
            <input
              id="newAccountsPerDay"
              type="number"
              min={1}
              value={newAccountsPerDay}
              onChange={(e) => setNewAccountsPerDay(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>

          <div>
            <label
              htmlFor="globalManualJobsPerDay"
              className="block text-xs text-[#7C8494] mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Cadastros manuais no site/24h
            </label>
            <input
              id="globalManualJobsPerDay"
              type="number"
              min={1}
              value={globalManualJobsPerDay}
              onChange={(e) => setGlobalManualJobsPerDay(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>

          <div>
            <label
              htmlFor="globalAiPerDay"
              className="block text-xs text-[#7C8494] mb-2"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Análises de IA no site/24h
            </label>
            <input
              id="globalAiPerDay"
              type="number"
              min={1}
              value={globalAiPerDay}
              onChange={(e) => setGlobalAiPerDay(e.target.value)}
              className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-[#E4E6EB]"
            />
          </div>
        </div>

        <p className="text-xs text-[#7C8494]">
          Mais contas novas podem aumentar o gasto com IA. Revise os tetos de IA e de cadastros ao mudar esse limite.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-[#378ADD] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4FA0F0] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            {isSaving ? "Salvando..." : "Salvar configurações"}
          </button>
          {toast && (
            <span className="text-xs text-[#3FB950]" style={{ fontFamily: "var(--font-outfit)" }}>
              {toast}
            </span>
          )}
        </div>
      </form>
    </GlassPanel>
  );
}
