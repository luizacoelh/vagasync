"use client";

import { useState, useTransition } from "react";
import GlassPanel from "@/components/ui/Glass";
import { deleteMyAccount } from "@/app/actions/account";

const CONFIRMATION = "EXCLUIR";

// Exclusão da conta em /perfil, com a palavra de confirmação digitada.
// A regra do que é apagado fica em lib/accountDeletion.ts.
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMyAccount(typed.trim());
      if (result?.error) setError(result.error);
    });
  }

  return (
    <GlassPanel plateClassName="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#C4C7D0]" style={{ fontFamily: "var(--font-outfit)" }}>
            Excluir minha conta
          </p>
          <p className="text-xs text-[#7C8494] mt-0.5">
            Apaga suas vagas, seu perfil e seus dados de login. Não dá para desfazer.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="glass-btn shrink-0 rounded-xl px-4 py-2 text-xs font-medium text-[#E5534B]"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            Excluir conta
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[#7C8494]">
            Se quiser guardar suas candidaturas, use &quot;Exportar CSV&quot; antes. Para confirmar, digite{" "}
            <span className="font-semibold text-[#C4C7D0]">{CONFIRMATION}</span>.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Digite ${CONFIRMATION} para confirmar`}
            autoComplete="off"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#E4E6EB] outline-none focus:border-[#E5534B]/60"
          />
          {error && <p className="text-xs text-[#E5534B]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              disabled={pending}
              className="glass-btn rounded-xl px-4 py-2 text-xs font-medium text-[#C4C7D0]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending || typed.trim() !== CONFIRMATION}
              className="rounded-xl bg-[#E5534B]/20 px-4 py-2 text-xs font-medium text-[#E5534B] disabled:opacity-40"
            >
              {pending ? "Excluindo..." : "Excluir definitivamente"}
            </button>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
