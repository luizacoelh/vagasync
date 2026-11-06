// Amostra de /monitoradas por conta, definida no /admin. Sem Prisma: usado
// também no cliente (components/admin/UsersTable.tsx). Regra completa em
// lib/monitoredSample.ts (sampleHoursLeftFor).

export const MAX_SAMPLE_OVERRIDE_HOURS = 720;
// "Bloquear" grava esta data (1970); qualquer outra data no passado é uma
// liberação que venceu. As duas dão 0 h de amostra; só o rótulo muda.
export const SAMPLE_BLOCKED_AT = new Date(0);
// Horário mostrado no /admin: fixo, para o HTML do servidor (UTC na Vercel)
// bater com o do navegador.
export const SAMPLE_DISPLAY_TZ = "America/Sao_Paulo";
const HOUR = 3600000;

export type SampleStatus =
  | { kind: "liberada"; until: Date }
  | { kind: "liberacao-vencida"; until: Date }
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
    if (until.getTime() <= SAMPLE_BLOCKED_AT.getTime()) return { kind: "bloqueada", until: null };
    return until.getTime() > now ? { kind: "liberada", until } : { kind: "liberacao-vencida", until };
  }
  if (trialHours <= 0) return { kind: "desligada", until: null };
  const until = new Date(new Date(user.createdAt).getTime() + trialHours * HOUR);
  return until.getTime() > now ? { kind: "padrao", until } : { kind: "encerrada", until: null };
}

export function formatSampleDate(date: Date): string {
  return date.toLocaleString("pt-BR", {
    timeZone: SAMPLE_DISPLAY_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
