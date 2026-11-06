import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { AI_ACTIONS_ONLY } from "@/lib/aiUsageStats";
import { ACTIVE_ACCOUNT_WHERE } from "@/lib/deletedAccount";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const users = await prisma.user.findMany({
    where: ACTIVE_ACCOUNT_WHERE,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      dailyAiLimitOverride: true,
      geminiCallCount: true,
      geminiCallResetAt: true,
      createdAt: true,
      _count: { select: { jobs: true, aiUsage: { where: AI_ACTIONS_ONLY } } },
    },
  });

  return NextResponse.json(users);
}
