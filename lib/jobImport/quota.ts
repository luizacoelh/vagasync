import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { IMPORT_QUOTA, IMPORT_USAGE_ACTION } from "@/lib/jobImport/types";

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Reserva uma importação antes de baixar a página. Contado em AiUsage com a ação
// "import_url" (sem migration), que fica fora das contas de IA. A primeira
// escrita serializa os escritores SQLite/libSQL, como em lib/ipRateLimit.ts:
// contar e reservar acontecem na mesma transação. A reserva não volta se a
// leitura falhar.
export async function reserveImport(
  userId: string,
  ip: string | null,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.updateMany({ where: { id: userId }, data: { geminiCallCount: { increment: 0 } } });
    if (user.count !== 1) return false;
    const now = Date.now();
    const mine = (ms: number) =>
      tx.aiUsage.count({ where: { userId, action: IMPORT_USAGE_ACTION, createdAt: { gte: new Date(now - ms) } } });
    if ((await mine(HOUR)) >= IMPORT_QUOTA.perHour) return false;
    if ((await mine(DAY)) >= IMPORT_QUOTA.perDay) return false;
    if (ip) {
      const fromIp = await tx.aiUsage.count({
        where: { ip, action: IMPORT_USAGE_ACTION, createdAt: { gte: new Date(now - HOUR) } },
      });
      if (fromIp >= IMPORT_QUOTA.perIpHour) return false;
    }
    await tx.aiUsage.create({ data: { userId, action: IMPORT_USAGE_ACTION, ip } });
    return true;
  });
}
