import { prisma } from "@/lib/prisma";

// Volume para o alerta do GitHub Actions (.github/workflows/alerta-volume.yml).
// Só números, sem ids nem e-mails. Os limites ficam abaixo dos tetos de
// lib/jobCreation.ts e lib/signupGuard.ts: o aviso chega antes de o cadastro
// travar para todo mundo. storedJobs é estoque (não janela de 24h): se passar
// do limite, o alerta segue falhando até alguém olhar o banco.
export const VOLUME_ALERTS = {
  manualCreated: 200,
  accountsCreating: 5,
  newAccounts: 5,
  aiCalls: 300,
  storedJobs: 5000,
} as const;

type Counts = Record<keyof typeof VOLUME_ALERTS, number | bigint>;

export async function loadVolumeReport() {
  // manualCreated vem do contador global (lib/jobCreation.ts): sem o dono, e
  // vaga apagada não some daqui. accountsCreating conta qualquer conta ativa:
  // subir o limite se a base passar de umas 5 contas no mesmo dia. aiCalls é
  // só a análise pelo site: a do n8n tem cota própria e pode chegar a 480 por
  // dia sem ser abuso.
  const [row] = await prisma.$queryRaw<Counts[]>`
    SELECT
      (SELECT COALESCE(SUM("count"), 0) FROM "GlobalJobHour"
        WHERE "hour" >= unixepoch() / 3600 - 24) AS manualCreated,
      (SELECT COUNT(*) FROM "JobCreationQuota"
        WHERE channel = 'manual' AND "dayCount" > 0 AND "dayStart" > unixepoch() - 86400) AS accountsCreating,
      (SELECT COUNT(*) FROM "User" WHERE unixepoch("createdAt") > unixepoch() - 86400) AS newAccounts,
      (SELECT COUNT(*) FROM "AiUsage" WHERE action = 'analyze_job' AND unixepoch("createdAt") > unixepoch() - 86400) AS aiCalls,
      (SELECT COUNT(*) FROM "Job") AS storedJobs`;

  const keys = Object.keys(VOLUME_ALERTS) as (keyof typeof VOLUME_ALERTS)[];
  const counts = Object.fromEntries(keys.map((key) => [key, Number(row[key])])) as Record<keyof typeof VOLUME_ALERTS, number>;
  const alerts = keys
    .filter((key) => counts[key] > VOLUME_ALERTS[key])
    .map((key) => `${key}: ${counts[key]} (limite ${VOLUME_ALERTS[key]})`);

  return { ...counts, alert: alerts.length > 0, alerts };
}
