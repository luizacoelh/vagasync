import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/appSettings";

// Análises pelo site em 24h, sem o dono. A coleta do n8n grava outra ação em
// AiUsage e tem cota própria, então fica fora dessa conta.
async function siteAiLimitReached(db: Prisma.TransactionClient, userId: string, limit: number) {
  if (await db.user.count({ where: { id: userId, isOwner: true } })) return false;
  const calls = await db.aiUsage.count({
    where: {
      action: "analyze_job",
      createdAt: { gte: new Date(Date.now() - 86400000) },
      user: { isOwner: false },
    },
  });
  return calls >= limit;
}

// Pré-checagem só de leitura, antes de gastar a cota da conta: com o site
// bloqueado, repetir a tentativa não pode consumir as análises de ninguém.
export function checkSiteAiLimit(userId: string, limit: number) {
  return siteAiLimitReached(prisma, userId, limit);
}

// Reserva persistente antes do Gemini. A primeira escrita serializa os
// escritores SQLite/libSQL; contar e reservar ocorre na mesma transacao.
// Tambem aplica o teto de IA do site: aqui esta a garantia contra concorrencia.
export async function checkIpRateLimit(
  ip: string | null,
  userId: string,
  tokens: number,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<{ allowed: boolean; reason?: "ip" | "site" }> {
  const settings = await getAppSettings();
  return db.$transaction(async tx => {
    const user = await tx.user.updateMany({ where: { id: userId }, data: { geminiCallCount: { increment: 0 } } });
    if (user.count !== 1) return { allowed: false };
    if (ip) {
      const count = await tx.aiUsage.count({ where: { ip, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (count >= settings.ipHourlyLimit) return { allowed: false, reason: "ip" };
    }
    if (await siteAiLimitReached(tx, userId, settings.globalAiPerDay)) {
      // Aparece nos logs da Vercel; o alerta de volume avisa por e-mail.
      console.warn("[ai] teto de análises do site em 24h atingido");
      return { allowed: false, reason: "site" };
    }
    await tx.aiUsage.create({ data: { userId, action: "analyze_job", tokens, ip } });
    return { allowed: true };
  });
}

export function getClientIp(req: Request): string | null {
  // Na Vercel, o IP real do cliente vem no header x-forwarded-for. Pode ter
  // vários IPs separados por vírgula se passar por mais de um proxy — o
  // primeiro é o do cliente original.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim().slice(0, 64);
  return null;
}
