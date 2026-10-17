"use client";

import { useState } from "react";
import GlassPanel from "@/components/ui/Glass";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  dailyAiLimitOverride: number | null;
  geminiCallCount: number;
  _count: { jobs: number; aiUsage: number };
}

export default function UsersTable({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patchUser(
    id: string,
    patch: { dailyAiLimitOverride?: number | null; isAdmin?: boolean }
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

  return (
    <GlassPanel plateClassName="p-6">
      <p
        className="text-xs font-medium text-[#7C8494] uppercase tracking-wide mb-5"
        style={{ fontFamily: "var(--font-outfit)" }}
      >
        Usuários ({users.length})
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-[#E5534B]/30 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
