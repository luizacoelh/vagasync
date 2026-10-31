import { getAppSettings, type AppSettings } from "@/lib/appSettings";
import { prisma } from "@/lib/prisma";

// Volume para o alerta do GitHub Actions (.github/workflows/alerta-volume.yml).
// Só números, sem ids nem e-mails. Os limites acompanham os tetos editáveis em
// /admin e ficam abaixo deles: o aviso chega antes de o site travar para todo
// mundo. storedJobs é estoque (não janela de 24h): se passar do limite, o alerta
// segue falhando até alguém olhar o banco.
export function volumeAlerts(settings: AppSettings) {
  return {
    manualCreated: Math.ceil(settings.globalManualJobsPerDay * 0.4),
    accountsCreating: 5,
    newAccounts: Math.ceil(settings.newAccountsPerDay / 4),
    aiCalls: Math.ceil(settings.globalAiPerDay * 0.6),
    storedJobs: 5000,
  };
}

type VolumeAlerts = ReturnType<typeof volumeAlerts>;
type Counts = Record<keyof VolumeAlerts, number | bigint>;

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

  const limits = volumeAlerts(await getAppSettings());
  const keys = Object.keys(limits) as (keyof VolumeAlerts)[];
  const counts = Object.fromEntries(keys.map((key) => [key, Number(row[key])])) as VolumeAlerts;
  const alerts = keys
    .filter((key) => counts[key] > limits[key])
    .map((key) => `${key}: ${counts[key]} (limite ${limits[key]})`);

  return { ...counts, alert: alerts.length > 0, alerts };
}
