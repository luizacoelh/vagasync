import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/appSettings";
import { parseArray } from "@/lib/json";
import { compareSkills } from "@/lib/skillGap";
import { isDeletedAccount } from "@/lib/deletedAccount";

export { MAX_SAMPLE_OVERRIDE_HOURS } from "@/lib/sampleOverride";

// Amostra de /monitoradas para contas novas. O n8n só alimenta a conta de
// N8N_TARGET_USER_ID (lib/n8nWebhook.ts); durante AppSettings.monitoredTrialHours
// depois de criar a conta, as outras contas veem as vagas que o robô trouxe
// para essa conta (source "n8n") nos últimos SAMPLE_DAYS dias, só os campos
// públicos (sem status, notas, datas de candidatura nem checklist). O filtro
// não olha o status: a vaga continua na amostra depois que a dona a triou, para
// a amostra não revelar em quais vagas ela marcou interesse ou descartou.
// "Tenho interesse" copia a vaga para a conta de quem vê, sem chamar a IA
// (app/actions/monitoredSample.ts).

export const SAMPLE_DAYS = 7;
export const SAMPLE_LIMIT = 30;
const HOUR = 3600000;

export const SAMPLE_SELECT = {
  id: true,
  company: true,
  title: true,
  location: true,
  salary: true,
  summary: true,
  technologies: true,
  url: true,
  createdAt: true,
} as const;

export type SampleJob = {
  id: string;
  company: string;
  title: string;
  location: string;
  salary: string | null;
  summary: string | null;
  technologies: string[];
  url: string | null;
  createdAt: Date;
};

export function sampleTargetUserId(): string | null {
  return process.env.N8N_TARGET_USER_ID || null;
}

// Horas que faltam da amostra (0 = acabou ou desligada).
export function trialHoursLeft(createdAt: Date, trialHours: number, now = Date.now()): number {
  if (trialHours <= 0) return 0;
  const left = createdAt.getTime() + trialHours * HOUR - now;
  return left > 0 ? Math.ceil(left / HOUR) : 0;
}

// Horas até a data liberada no /admin (0 = já passou, ou seja, bloqueada).
export function hoursUntil(until: Date, now = Date.now()): number {
  const left = until.getTime() - now;
  return left > 0 ? Math.ceil(left / HOUR) : 0;
}

// Quanto tempo de amostra a conta ainda tem; 0 para a conta-alvo do n8n, conta
// excluída ou inexistente. User.monitoredTrialUntil (definido no /admin) vale
// mais que a regra padrão, inclusive com a amostra padrão desligada (0 h); uma
// liberação vencida não volta à regra padrão (o /admin mostra "Padrão" para isso).
export async function sampleHoursLeftFor(
  userId: string,
  db: Pick<PrismaClient, "user"> = prisma,
): Promise<number> {
  const target = sampleTargetUserId();
  if (!target || userId === target) return 0;
  const [user, settings] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true, email: true, name: true, monitoredTrialUntil: true } }),
    getAppSettings(),
  ]);
  // Conta excluída (lib/accountDeletion.ts) não usa a amostra.
  if (!user || isDeletedAccount(user)) return 0;
  if (user.monitoredTrialUntil) return hoursUntil(user.monitoredTrialUntil);
  return trialHoursLeft(user.createdAt, settings.monitoredTrialHours);
}

// Mesmo filtro na página e na Server Action. Índice (userId, source, createdAt).
export function sampleWhere(target: string) {
  return {
    userId: target,
    source: "n8n",
    createdAt: { gte: new Date(Date.now() - SAMPLE_DAYS * 24 * HOUR) },
  };
}

export async function getMonitoredSample(db: Pick<PrismaClient, "job"> = prisma): Promise<SampleJob[]> {
  const target = sampleTargetUserId();
  if (!target) return [];
  const rows = await db.job.findMany({
    where: sampleWhere(target),
    orderBy: { createdAt: "desc" },
    take: SAMPLE_LIMIT,
    select: SAMPLE_SELECT,
  });
  return rows.map((row) => ({ ...row, technologies: parseArray(row.technologies) }));
}

// Quantas tecnologias da vaga estão nas skills do perfil de quem vê.
export function skillMatchCount(technologies: string[], userSkills: string[]): number {
  if (userSkills.length === 0 || technologies.length === 0) return 0;
  return compareSkills(technologies, userSkills).known.length;
}

// Ordena por afinidade com as skills, mantendo a ordem original (mais nova
// primeiro) entre vagas com a mesma contagem.
export function sortBySkillMatch<T extends { technologies: string[] }>(jobs: T[], userSkills: string[]): T[] {
  if (userSkills.length === 0) return jobs;
  return jobs
    .map((job, index) => ({ job, index, score: skillMatchCount(job.technologies, userSkills) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ job }) => job);
}
