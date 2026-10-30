import { prisma } from "@/lib/prisma";

// Volume das últimas 24h para o alerta do GitHub Actions
// (.github/workflows/alerta-volume.yml). Só números, sem ids nem e-mails. Os
// limites ficam abaixo dos tetos de lib/jobCreation.ts: o aviso chega antes de
// o cadastro travar para todo mundo.
export const VOLUME_ALERTS = {
  manualJobs: 200,
  accountsCreating: 10,
  aiCalls: 300,
  totalJobs: 5000,
} as const;

type Counts = { totalJobs: number; manualJobs: number; accountsCreating: number; aiCalls: number };

export async function loadVolumeReport() {
  const [row] = await prisma.$queryRaw<Counts[]>`
    SELECT (SELECT COUNT(*) FROM "Job") AS totalJobs,
      (SELECT COUNT(*) FROM "Job" WHERE source = 'manual' AND unixepoch("createdAt") > unixepoch() - 86400) AS manualJobs,
      (SELECT COUNT(DISTINCT "userId") FROM "Job" WHERE source = 'manual' AND unixepoch("createdAt") > unixepoch() - 86400) AS accountsCreating,
      (SELECT COUNT(*) FROM "AiUsage" WHERE unixepoch("createdAt") > unixepoch() - 86400) AS aiCalls`;

  const counts = {
    totalJobs: Number(row.totalJobs),
    manualJobs: Number(row.manualJobs),
    accountsCreating: Number(row.accountsCreating),
    aiCalls: Number(row.aiCalls),
  };
  const alerts = (Object.keys(VOLUME_ALERTS) as (keyof typeof VOLUME_ALERTS)[])
    .filter((key) => counts[key] > VOLUME_ALERTS[key])
    .map((key) => `${key}: ${counts[key]} (limite ${VOLUME_ALERTS[key]})`);

  return { ...counts, alert: alerts.length > 0, alerts };
}
