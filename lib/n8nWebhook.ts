import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { DEDUP_WINDOW_DAYS, type ExistingJob } from "@/lib/jobDedup";

// Partes comuns de /api/webhook/n8n e /api/webhook/n8n/check.

// Confere o header x-webhook-secret (comparação timing-safe) e devolve o
// usuário que recebe as vagas (N8N_TARGET_USER_ID), ou a resposta de erro.
export async function authorizeN8n(
  req: NextRequest
): Promise<{ userId: string; response: null } | { userId: null; response: NextResponse }> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const targetUserId = process.env.N8N_TARGET_USER_ID;

  if (!secret || !targetUserId) {
    return {
      userId: null,
      response: NextResponse.json(
        { error: "Webhook não configurado. Defina N8N_WEBHOOK_SECRET e N8N_TARGET_USER_ID no .env." },
        { status: 501 }
      ),
    };
  }

  const receivedSecret = req.headers.get("x-webhook-secret") ?? "";
  const secretBuf = Buffer.from(secret);
  const receivedBuf = Buffer.from(receivedSecret);
  const lengthsMatch = secretBuf.length === receivedBuf.length;
  const safeReceived = lengthsMatch ? receivedBuf : Buffer.alloc(secretBuf.length);
  const valid = lengthsMatch && timingSafeEqual(secretBuf, safeReceived);

  if (!valid) {
    return { userId: null, response: NextResponse.json({ error: "Não autorizado." }, { status: 401 }) };
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!targetUser) {
    return {
      userId: null,
      response: NextResponse.json(
        { error: "N8N_TARGET_USER_ID não corresponde a nenhum usuário." },
        { status: 500 }
      ),
    };
  }

  return { userId: targetUser.id, response: null };
}

// Vagas do usuário que podem ser duplicata de alguma das candidatas: as de
// mesma URL (qualquer data) e todas as da janela de título + empresa. Uma
// consulta só, com as colunas que lib/jobDedup.ts compara.
export async function loadDedupJobs(userId: string, urls: string[]): Promise<ExistingJob[]> {
  const since = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return prisma.job.findMany({
    where: {
      userId,
      OR: [...(urls.length > 0 ? [{ url: { in: urls } }] : []), { createdAt: { gte: since } }],
    },
    select: { id: true, url: true, title: true, company: true, createdAt: true },
  });
}

// Campo de texto opcional vindo do n8n: string curta ou nada.
export function optionalText(value: unknown, max = 200): string | undefined {
  return typeof value === "string" && value.trim() !== "" && value.length <= max ? value : undefined;
}
