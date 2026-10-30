import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type JobChannel = "manual" | "n8n";
export const JOB_LIMITS = {
  manual: { minute: 10, day: 100 },
  n8n: { minute: 60, day: 500 },
  stored: 2000,
  // Teto do site inteiro: a cota acima é por conta, e várias contas OAuth a
  // somariam. Vale para o cadastro manual de quem não é o dono.
  globalManualDay: 500,
} as const;

// Cadastros manuais do site, por hora, sem os do dono. O contador é próprio:
// somar as janelas de 24h de cada conta deixava passar quem espalhasse a
// abertura das janelas, porque cada uma sai inteira da soma ao vencer. Conta
// 25 horas para valer em qualquer intervalo de 24h, mesmo começando no meio de
// uma hora. Apagar a vaga não devolve o espaço.
const GLOBAL_MANUAL_COUNT = Prisma.sql`(SELECT COALESCE(SUM("count"), 0) FROM "GlobalJobHour"
  WHERE "hour" >= unixepoch() / 3600 - 24)`;

export class JobInputError extends Error {
  readonly status = 400;
}

export class JobQuotaError extends Error {
  readonly status = 429;
  constructor(message: string, public readonly retryAfter?: number) { super(message); }
}

type QuotaState = { stored: number; minuteCount: number; dayCount: number; minuteLeft: number; dayLeft: number; globalManual: number; owner: number };

async function readQuota(db: Prisma.TransactionClient, userId: string, channel: string) {
  const [state] = await db.$queryRaw<QuotaState[]>`
    SELECT (SELECT COUNT(*) FROM "Job" WHERE "userId" = ${userId}) AS stored,
      CASE WHEN q."minuteStart" > unixepoch() - 60 THEN q."minuteCount" ELSE 0 END AS minuteCount,
      CASE WHEN q."dayStart" > unixepoch() - 86400 THEN q."dayCount" ELSE 0 END AS dayCount,
      MAX(1, COALESCE(q."minuteStart", 0) + 60 - unixepoch()) AS minuteLeft,
      MAX(1, COALESCE(q."dayStart", 0) + 86400 - unixepoch()) AS dayLeft,
      ${GLOBAL_MANUAL_COUNT} AS globalManual,
      EXISTS (SELECT 1 FROM "User" WHERE id = ${userId} AND "isOwner" = 1) AS owner
    FROM (SELECT 1) LEFT JOIN "JobCreationQuota" q ON q."userId" = ${userId} AND q.channel = ${channel}`;
  return state;
}

function assertQuota(state: QuotaState, channel: JobChannel) {
  if (Number(state.stored) >= JOB_LIMITS.stored) {
    throw new JobQuotaError(`Você atingiu o limite de ${JOB_LIMITS.stored} vagas armazenadas, incluindo as descartadas. Exclua vagas que não precisa mais antes de cadastrar outra.`);
  }
  if (Number(state.dayCount) >= JOB_LIMITS[channel].day) {
    throw new JobQuotaError(`Limite de ${JOB_LIMITS[channel].day} cadastros em 24 horas atingido para ${channel === "n8n" ? "a coleta automática" : "o cadastro manual"}. Tente novamente após a renovação da cota.`, Number(state.dayLeft));
  }
  if (Number(state.minuteCount) >= JOB_LIMITS[channel].minute) {
    throw new JobQuotaError(`Muitos cadastros em pouco tempo. Aguarde até um minuto e tente novamente.`, Number(state.minuteLeft));
  }
  if (channel === "manual" && !Number(state.owner) && Number(state.globalManual) >= JOB_LIMITS.globalManualDay) {
    // Aparece nos logs da Vercel; o alerta de volume avisa por e-mail.
    console.warn(`[jobs] teto global de ${JOB_LIMITS.globalManualDay} cadastros manuais em 24h atingido`);
    throw new JobQuotaError("O cadastro de vagas está temporariamente limitado. Tente novamente mais tarde.", 3600);
  }
}

// Pré-checagem para não gastar Gemini quando a conta já está bloqueada.
// A garantia contra concorrência está na transação de createLimitedJob.
export async function checkJobCreationQuota(userId: string, channel: JobChannel) {
  assertQuota(await readQuota(prisma, userId, channel), channel);
}

export async function createLimitedJob(
  data: Omit<Prisma.JobUncheckedCreateInput, "source">,
  channel: JobChannel,
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    await reserveQuota(tx, data.userId, channel);
    // Falha no INSERT reverte também a cota. Excluir Job não mexe nela.
    return tx.job.create({ data: { ...data, source: channel } });
  }, { maxWait: 10000, timeout: 10000 });
}

async function reserveQuota(tx: Prisma.TransactionClient, userId: string, channel: JobChannel, key: string = channel) {
  // Primeira operação é escrita: serializa escritores SQLite/libSQL antes
  // de consultar o teto. Não há leitura seguida de escrita fora da transação.
  await tx.$executeRaw`INSERT INTO "JobCreationQuota" ("userId", channel, "minuteStart", "minuteCount", "dayStart", "dayCount")
    VALUES (${userId}, ${key}, unixepoch(), 0, unixepoch(), 0)
    ON CONFLICT ("userId", channel) DO NOTHING`;
  const changed = await tx.$executeRaw`UPDATE "JobCreationQuota" SET
    "minuteCount" = CASE WHEN "minuteStart" <= unixepoch() - 60 THEN 1 ELSE "minuteCount" + 1 END,
    "minuteStart" = CASE WHEN "minuteStart" <= unixepoch() - 60 THEN unixepoch() ELSE "minuteStart" END,
    "dayCount" = CASE WHEN "dayStart" <= unixepoch() - 86400 THEN 1 ELSE "dayCount" + 1 END,
    "dayStart" = CASE WHEN "dayStart" <= unixepoch() - 86400 THEN unixepoch() ELSE "dayStart" END
    WHERE "userId" = ${userId} AND channel = ${key}
    AND ("minuteStart" <= unixepoch() - 60 OR "minuteCount" < ${JOB_LIMITS[channel].minute})
    AND ("dayStart" <= unixepoch() - 86400 OR "dayCount" < ${JOB_LIMITS[channel].day})
    AND (SELECT COUNT(*) FROM "Job" WHERE "userId" = ${userId}) < ${JOB_LIMITS.stored}`;
  if (changed !== 1 || !(await reserveGlobal(tx, userId, channel))) {
    assertQuota(await readQuota(tx, userId, key), channel);
    throw new JobQuotaError("Não foi possível reservar a cota de cadastro. Tente novamente em instantes.", 60);
  }
}

// Roda depois da escrita de reserveQuota, na mesma transação: se recusar, o
// erro desfaz também a cota da conta.
async function reserveGlobal(tx: Prisma.TransactionClient, userId: string, channel: JobChannel) {
  if (channel !== "manual") return true;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { isOwner: true } });
  if (user?.isOwner) return true;
  await tx.$executeRaw`DELETE FROM "GlobalJobHour" WHERE "hour" < unixepoch() / 3600 - 24`;
  const changed = await tx.$executeRaw`INSERT INTO "GlobalJobHour" ("hour", "count")
    SELECT unixepoch() / 3600, 1 WHERE ${GLOBAL_MANUAL_COUNT} < ${JOB_LIMITS.globalManualDay}
    ON CONFLICT ("hour") DO UPDATE SET "count" = "count" + 1`;
  return changed === 1;
}

// Reserva antes da IA; falhas e duplicatas posteriores tambem consomem tentativa.
export async function consumeWebhookAnalysisQuota(userId: string) {
  await prisma.$transaction(tx => reserveQuota(tx, userId, "n8n", "n8n-analysis"));
}
