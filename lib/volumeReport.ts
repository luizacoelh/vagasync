import { prisma } from "@/lib/prisma";

// Volume para o alerta do GitHub Actions (.github/workflows/alerta-volume.yml).
// Só números, sem ids nem e-mails. Os limites ficam abaixo dos tetos de
// lib/jobCreation.ts e lib/signupGuard.ts: o aviso chega antes de o cadastro
// travar para todo mundo. storedJobs é estoque (não janela de 24h): se passar
// do limite, o alerta segue falhando até alguém olhar o banco.
export const VOLUME_ALERTS = {
  manualCreated: 200,
  accountsCreating: 10,
  newAccounts: 10,
  aiCalls: 300,
  storedJobs: 5000,
} as const;

type Counts = Record<keyof typeof VOLUME_ALERTS, number | bigint>;

export async function loadVolumeReport() {
  // Cadastros contados pela cota (lib/jobCreation.ts): vaga apagada não some daqui.
  const [row] = await prisma.$queryRaw<Counts[]>`
    SELECT
      (SELECT COALESCE(SUM("dayCount"), 0) FROM "JobCreationQuota"
        WHERE channel = 'manual' AND "dayStart" > unixepoch() - 86400) AS manualCreated,
      (SELECT COUNT(*) FROM "JobCreationQuota"
        WHERE channel = 'manual' AND "dayCount" > 0 AND "dayStart" > unixepoch() - 86400) AS accountsCreating,
      (SELECT COUNT(*) FROM "User" WHERE unixepoch("createdAt") > unixepoch() - 86400) AS newAccounts,
      (SELECT COUNT(*) FROM "AiUsage" WHERE unixepoch("createdAt") > unixepoch() - 86400) AS aiCalls,
      (SELECT COUNT(*) FROM "Job") AS storedJobs`;

  const keys = Object.keys(VOLUME_ALERTS) as (keyof typeof VOLUME_ALERTS)[];
  const counts = Object.fromEntries(keys.map((key) => [key, Number(row[key])])) as Record<keyof typeof VOLUME_ALERTS, number>;
  const alerts = keys
    .filter((key) => counts[key] > VOLUME_ALERTS[key])
    .map((key) => `${key}: ${counts[key]} (limite ${VOLUME_ALERTS[key]})`);

  return { ...counts, alert: alerts.length > 0, alerts };
}
