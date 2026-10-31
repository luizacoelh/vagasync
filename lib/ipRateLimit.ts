import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/appSettings";

// Reserva persistente antes do Gemini. A primeira escrita serializa os
// escritores SQLite/libSQL; contar e reservar ocorre na mesma transacao.
// Tambem aplica o teto de IA do site em 24h, sem o dono. A coleta do n8n grava
// outra acao em AiUsage e tem cota propria, entao fica fora dessa conta.
export async function checkIpRateLimit(
  ip: string | null,
  userId: string,
  tokens: number,
): Promise<{ allowed: boolean; reason?: "ip" | "site" }> {
  const settings = await getAppSettings();
  return prisma.$transaction(async tx => {
    const user = await tx.user.updateMany({ where: { id: userId }, data: { geminiCallCount: { increment: 0 } } });
    if (user.count !== 1) return { allowed: false };
    if (ip) {
      const count = await tx.aiUsage.count({ where: { ip, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (count >= settings.ipHourlyLimit) return { allowed: false, reason: "ip" };
    }
    const owner = await tx.user.count({ where: { id: userId, isOwner: true } });
    if (!owner) {
      const siteCalls = await tx.aiUsage.count({
        where: {
          action: "analyze_job",
          createdAt: { gte: new Date(Date.now() - 86400000) },
          user: { isOwner: false },
        },
      });
      if (siteCalls >= settings.globalAiPerDay) {
        // Aparece nos logs da Vercel; o alerta de volume avisa por e-mail.
        console.warn("[ai] teto de análises do site em 24h atingido");
        return { allowed: false, reason: "site" };
      }
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
