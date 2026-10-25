"use client";

import { useState } from "react";
import { JobStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/jobStatus";
import { updateJobStatus } from "@/app/actions/jobs";

export default function StatusSelect({ jobId, initialStatus }: { jobId: string; initialStatus: JobStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [toast, setToast] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleChange(newStatus: JobStatus) {
    const previousStatus = status;
    setStatus(newStatus);
    setIsUpdating(true);
    setToast(null);

    try {
      const result = await updateJobStatus(jobId, newStatus);

      if ("error" in result) {
        setToast(result.error);
        setStatus(previousStatus);
        return;
      }

      // Sem router.refresh(): o revalidatePath da Server Action já devolve a
      // página re-renderizada na mesma resposta (uma ida ao servidor, não duas).
      setToast("Status atualizado.");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Falha ao atualizar o status.");
      setStatus(previousStatus);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="relative">
      <select
        value={status}
        disabled={isUpdating}
        onChange={(e) => handleChange(e.target.value as JobStatus)}
        className="glass-input rounded-xl px-3 py-2 text-sm font-mono text-[#E4E6EB] disabled:opacity-50"
      >
        {/* DESCARTADA não é opção manual: quem descarta é /monitoradas. */}
        {Object.values(JobStatus).filter((s) => s !== "DESCARTADA" || s === status).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {toast && (
        <p className="absolute left-0 top-full mt-2 whitespace-nowrap font-mono text-xs text-[#85B7EB]">
          {toast}
        </p>
      )}
    </div>
  );
}
