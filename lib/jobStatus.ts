import { JobStatus } from "@prisma/client";

export const STATUS_LABELS: Record<JobStatus, string> = {
  MONITORADA: "Monitorada",
  APLICADA: "Aplicada",
  ENTREVISTA: "Entrevista",
  REPROVADA: "Reprovada",
  OFERTA: "Oferta",
  DESCARTADA: "Descartada",
};

export const STATUS_STYLES: Record<JobStatus, string> = {
  // Roxo/neutro — vaga coletada automaticamente, ainda não candidatada
  MONITORADA: "border-[#8B5CF6]/40 bg-[#8B5CF6]/10 text-[#8B5CF6]",
  APLICADA:   "border-[#378ADD]/40 bg-[#378ADD]/10 text-[#378ADD]",
  ENTREVISTA: "border-[#F0B429]/40 bg-[#F0B429]/10 text-[#F0B429]",
  REPROVADA:  "border-[#E5534B]/40 bg-[#E5534B]/10 text-[#E5534B]",
  OFERTA:     "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]",
  DESCARTADA: "border-white/15 bg-white/5 text-[#7C8494]",
};

// Ordem visual do funil — MONITORADA fica antes de APLICADA
export const STATUS_ORDER: JobStatus[] = [
  "MONITORADA",
  "APLICADA",
  "ENTREVISTA",
  "REPROVADA",
  "OFERTA",
];

// Fora do dashboard principal (lista, contadores e filtro). MONITORADA mora
// em /monitoradas até o usuário marcar "Tenho interesse"; DESCARTADA não
// aparece em lugar nenhum — fica no banco só para a deduplicação por URL do
// webhook não recriar a vaga.
export const HIDDEN_FROM_DASHBOARD: JobStatus[] = ["MONITORADA", "DESCARTADA"];

export const DASHBOARD_STATUSES: JobStatus[] = STATUS_ORDER.filter(
  (status) => !HIDDEN_FROM_DASHBOARD.includes(status)
);
