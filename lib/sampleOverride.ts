// Amostra de /monitoradas por conta, definida no /admin. Sem Prisma: usado
// também no cliente (components/admin/UsersTable.tsx). Regra completa em
// lib/monitoredSample.ts (sampleHoursLeftFor).

export const MAX_SAMPLE_OVERRIDE_HOURS = 720;
const HOUR = 3600000;

export type SampleStatus =
  | { kind: "liberada"; until: Date }
  | { kind: "bloqueada"; until: null }
  | { kind: "padrao"; until: Date }
  | { kind: "encerrada"; until: null }
  | { kind: "desligada"; until: null };

export function sampleStatus(
  user: { createdAt: Date | string; monitoredTrialUntil: Date | string | null },
  trialHours: number,
  now = Date.now(),
): SampleStatus {
  if (user.monitoredTrialUntil) {
    const until = new Date(user.monitoredTrialUntil);
    return until.getTime() > now ? { kind: "liberada", until } : { kind: "bloqueada", until: null };
  }
  if (trialHours <= 0) return { kind: "desligada", until: null };
  const until = new Date(new Date(user.createdAt).getTime() + trialHours * HOUR);
  return until.getTime() > now ? { kind: "padrao", until } : { kind: "encerrada", until: null };
}
