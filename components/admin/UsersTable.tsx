"use client";

import { useState } from "react";
import GlassPanel from "@/components/ui/Glass";
import { isDeletedAccount } from "@/lib/deletedAccount";
import { MAX_SAMPLE_OVERRIDE_HOURS, formatSampleDate, sampleStatus } from "@/lib/sampleOverride";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  dailyAiLimitOverride: number | null;
  geminiCallCount: number;
  createdAt: Date | string;
  monitoredTrialUntil: Date | string | null;
  _count: { jobs: number; aiUsage: number };
}

export default function UsersTable({
  initialUsers,
  deletedCount = 0,
  currentUserId,
  sampleTargetId = null,
  trialHours = 0,
  now = 0,
}: {
  initialUsers: AdminUser[];
  deletedCount?: number;
  currentUserId: string;
  sampleTargetId?: string | null;
  trialHours?: number;
  now?: number;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchUser(
    id: string,
    patch: { dailyAiLimitOverride?: number | null; isAdmin?: boolean; sampleHours?: number | null }
  ) {
    setError(null);
    setSavingId(id);

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível atualizar.");
        return;
      }

      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
    } catch {
      setError("Falha de conexão.");
    } finally {
      setSavingId(null);
    }
  }

  function handleOverrideBlur(id: string, value: string) {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      setError("Override precisa ser um número inteiro positivo, ou vazio para usar o padrão global.");
      return;
    }
    patchUser(id, { dailyAiLimitOverride: parsed });
  }

  const [sampleInput, setSampleInput] = useState<Record<string, string>>({});

  function releaseSample(id: string) {
    const hours = Number(sampleInput[id] ?? "24");
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_SAMPLE_OVERRIDE_HOURS) {
      setError(`Horas da amostra: inteiro de 1 a ${MAX_SAMPLE_OVERRIDE_HOURS}.`);
      return;
    }
    patchUser(id, { sampleHours: hours });
  }

  function sampleLabel(u: AdminUser) {
    if (!sampleTargetId) return "sem conta-alvo do n8n";
    if (u.id === sampleTargetId) return "recebe o feed do n8n";
    const status = sampleStatus(u, trialHours, now);
    const when = status.until ? formatSampleDate(status.until) : "";
    switch (status.kind) {
      case "liberada":
        return `liberada até ${when}`;
      case "liberacao-vencida":
        return `liberação encerrada em ${when}`;
      case "bloqueada":
        return "bloqueada";
      case "padrao":
        return `padrão, até ${when}`;
      case "encerrada":
        return "padrão, encerrada";
      case "desligada":
        return "padrão, desligada";
    }
  }

  return (
    <GlassPanel plateClassName="p-6">
      <p
        className="text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-5"
        style={{ fontFamily: "var(--font-outfit)" }}
      >
        Usuários ({users.length})
        {deletedCount > 0 && (
          <span className="normal-case tracking-normal font-normal">
            {" "}· {deletedCount} {deletedCount === 1 ? "conta excluída oculta" : "contas excluídas ocultas"}
          </span>
        )}
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-[#E5534B]/30 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr
              className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              <th className="px-3 py-2.5 font-medium">Usuário</th>
              <th className="px-3 py-2.5 font-medium">Vagas</th>
              <th className="px-3 py-2.5 font-medium">Chamadas de IA</th>
              <th className="px-3 py-2.5 font-medium">Uso hoje</th>
              <th className="px-3 py-2.5 font-medium">Override diário</th>
              <th className="px-3 py-2.5 font-medium">Amostra monitoradas</th>
              <th className="px-3 py-2.5 font-medium">Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-0">
                <td className="px-3 py-3">
                  <p className="text-[#E4E6EB]">{u.name ?? "—"}</p>
                  <p className="text-xs text-[#7C8494]">{u.email}</p>
                </td>
                <td className="px-3 py-3 text-[#C4C7D0]">{u._count.jobs}</td>
                <td className="px-3 py-3 text-[#C4C7D0]">{u._count.aiUsage}</td>
                <td className="px-3 py-3 text-[#C4C7D0]">{u.geminiCallCount}</td>
                {isDeletedAccount(u) ? (
                  // Conta excluída (lib/accountDeletion.ts): sem IA nem admin, e a
                  // rota PATCH recusa alterar.
                  <td colSpan={3} className="px-3 py-3 text-xs text-[#7C8494]">
                    Excluída
                  </td>
                ) : (
                <>
                <td className="px-3 py-3">
                  <input
                    type="number"
                    min={1}
                    defaultValue={u.dailyAiLimitOverride ?? ""}
                    placeholder="padrão"
                    disabled={savingId === u.id}
                    onBlur={(e) => handleOverrideBlur(u.id, e.target.value)}
                    className="glass-input w-24 rounded-lg px-2.5 py-1.5 text-xs text-[#E4E6EB] placeholder:text-[#4A5060] disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-3">
                  <p className="mb-1.5 text-xs text-[#C4C7D0]">{sampleLabel(u)}</p>
                  {sampleTargetId && u.id !== sampleTargetId && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={MAX_SAMPLE_OVERRIDE_HOURS}
                        value={sampleInput[u.id] ?? "24"}
                        onChange={(e) => setSampleInput((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        disabled={savingId === u.id}
                        aria-label="Horas de amostra"
                        className="glass-input w-16 rounded-lg px-2 py-1 text-xs text-[#E4E6EB] disabled:opacity-50"
                      />
                      <span className="text-xs text-[#7C8494]">h</span>
                      <button
                        type="button"
                        onClick={() => releaseSample(u.id)}
                        disabled={savingId === u.id}
                        className="glass-btn rounded-lg px-2 py-1 text-xs text-[#E4E6EB] disabled:opacity-50"
                      >
                        Liberar
                      </button>
                      <button
                        type="button"
                        onClick={() => patchUser(u.id, { sampleHours: 0 })}
                        disabled={savingId === u.id}
                        className="rounded-lg px-2 py-1 text-xs text-[#E5534B] hover:bg-[#E5534B]/10 disabled:opacity-50"
                      >
                        Bloquear
                      </button>
                      {u.monitoredTrialUntil && (
                        <button
                          type="button"
                          onClick={() => patchUser(u.id, { sampleHours: null })}
                          disabled={savingId === u.id}
                          className="rounded-lg px-2 py-1 text-xs text-[#7C8494] hover:bg-white/5 disabled:opacity-50"
                          title="Volta à regra padrão (horas depois do cadastro)"
                        >
                          Padrão
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {u.isOwner ? (
                    // O dono nunca tem o admin alterado pela interface — por isso
                    // não há checkbox, só o selo. Mudar o dono só via script/banco.
                    <span
                      className="inline-flex items-center rounded-full border border-[#85B7EB]/40 bg-[#85B7EB]/10 px-2.5 py-0.5 text-xs text-[#85B7EB]"
                      style={{ fontFamily: "var(--font-outfit)" }}
                      title="Dono da instância — o acesso de admin não pode ser alterado pela interface"
                    >
                      Dono
                    </span>
                  ) : (
                  <input
                    type="checkbox"
                    checked={u.isAdmin}
                    disabled={savingId === u.id || u.id === currentUserId}
                    onChange={(e) => patchUser(u.id, { isAdmin: e.target.checked })}
                    className="h-4 w-4 accent-[#378ADD] disabled:opacity-50"
                    title={
                      u.id === currentUserId
                        ? "Não é possível remover seu próprio acesso por aqui"
                        : undefined
                    }
                  />
                  )}
                </td>
                </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
