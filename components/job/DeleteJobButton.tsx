"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJobs } from "@/app/actions/jobs";
import { useLoginGate } from "@/components/auth/LoginGate";

export default function DeleteJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { requireLogin } = useLoginGate();

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteJobs([jobId]);
      if ("ok" in result) {
        router.push("/");
      } else {
        setIsDeleting(false);
        setConfirming(false);
      }
    } catch {
      setIsDeleting(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => !requireLogin("Entre para gerenciar as suas vagas.") && setConfirming(true)}
        className="text-xs text-[#7C8494] hover:text-[#E5534B] transition-colors"
        style={{ fontFamily: "var(--font-outfit)" }}
      >
        Excluir vaga
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs" style={{ fontFamily: "var(--font-outfit)" }}>
      <span className="text-[#7C8494]">Confirmar exclusão?</span>
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="text-[#E5534B] hover:underline disabled:opacity-50 transition-opacity"
      >
        {isDeleting ? "Excluindo..." : "Sim, excluir"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-[#7C8494] hover:text-[#C4C7D0] transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
