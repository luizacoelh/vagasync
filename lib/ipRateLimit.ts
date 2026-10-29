import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/appSettings";

// Reserva persistente antes do Gemini. A primeira escrita serializa os
// escritores SQLite/libSQL; contar e reservar ocorre na mesma transacao.
export async function checkIpRateLimit(ip: string | null, userId: string, tokens: number): Promise<{ allowed: boolean }> {
  const settings = await getAppSettings();
  return prisma.$transaction(async tx => {
    const user = await tx.user.updateMany({ where: { id: userId }, data: { geminiCallCount: { increment: 0 } } });
    if (user.count !== 1) return { allowed: false };
    if (ip) {
      const count = await tx.aiUsage.count({ where: { ip, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (count >= settings.ipHourlyLimit) return { allowed: false };
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
