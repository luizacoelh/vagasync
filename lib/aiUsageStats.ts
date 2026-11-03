import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { IMPORT_USAGE_ACTION } from "@/lib/jobImport/types";

const DAYS = 14;

// Consumo de IA para o painel de /admin. AiUsage só cresce (a coleta do n8n
// grava todo dia), então o banco soma e só os últimos 14 dias vêm linha a linha.
// Importação por link também grava em AiUsage, mas não usa IA: fica de fora.
export const AI_ACTIONS_ONLY = { action: { not: IMPORT_USAGE_ACTION } };

export async function getAiUsageStats(db: PrismaClient = prisma) {
  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  const [grouped, recentUsage] = await Promise.all([
    db.aiUsage.groupBy({
      by: ["userId"],
      where: AI_ACTIONS_ONLY,
      _count: { _all: true },
      _sum: { tokens: true },
      _max: { createdAt: true },
    }),
    db.aiUsage.findMany({
      where: { ...AI_ACTIONS_ONLY, createdAt: { gte: since } },
      select: { createdAt: true, tokens: true },
    }),
  ]);

  const users = await db.user.findMany({
    where: { id: { in: grouped.map((row) => row.userId) } },
    select: { id: true, name: true, email: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  const byUser = grouped
    .map((row) => ({
      userId: row.userId,
      userName: usersById.get(row.userId)?.name ?? null,
      userEmail: usersById.get(row.userId)?.email ?? null,
      totalCalls: row._count._all,
      totalTokens: row._sum.tokens ?? 0,
      lastUsedAt: row._max.createdAt,
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls || Number(b.lastUsedAt) - Number(a.lastUsedAt));

  const totalCalls = byUser.reduce((sum, row) => sum + row.totalCalls, 0);
  const totalTokens = byUser.reduce((sum, row) => sum + row.totalTokens, 0);

  const byDayMap = new Map<string, { calls: number; tokens: number }>();
  for (const entry of recentUsage) {
    const date = entry.createdAt.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const existing = byDayMap.get(date) ?? { calls: 0, tokens: 0 };
    byDayMap.set(date, { calls: existing.calls + 1, tokens: existing.tokens + (entry.tokens ?? 0) });
  }

  // Garante que todos os 14 dias aparecem, mesmo os sem uso
  const byDay = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (DAYS - 1 - i));
    const date = d.toISOString().slice(0, 10);
    const data = byDayMap.get(date);
    return { date, calls: data?.calls ?? 0, tokens: data?.tokens ?? 0 };
  });

  return { byUser, byDay, totalCalls, totalTokens };
}
