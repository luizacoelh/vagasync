import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { stringifyArray } from "@/lib/json";
import { mapJob } from "@/lib/jobMapper";
import { analyzeJobWithGemini } from "@/lib/gemini";
import { logAiUsage } from "@/lib/aiUsage";
import { getAppSettings } from "@/lib/appSettings";
import { JobAnalysis } from "@/types/job";

export const runtime = "nodejs";
export const maxDuration = 60;

function isValidAnalysis(data: unknown): data is JobAnalysis {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.company === "string" && d.company.length > 0 && d.company.length < 200 &&
    typeof d.title === "string" && d.title.length > 0 && d.title.length < 200 &&
    typeof d.summary === "string" && d.summary.length < 2000 &&
    Array.isArray(d.requirements) && d.requirements.length <= 20 &&
    Array.isArray(d.technologies) && d.technologies.length <= 30 &&
    Array.isArray(d.questions) && d.questions.length <= 10 &&
    Array.isArray(d.checklist) && d.checklist.length <= 10
  );
}

// Fontes suportadas pelo n8n — usadas só para rastreabilidade no banco.
// Não afeta o comportamento da análise.
const VALID_SOURCES = ["indeed", "gupy", "infojobs", "catho", "gmail", "manual"] as const;
type JobSource = typeof VALID_SOURCES[number];

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const targetUserId = process.env.N8N_TARGET_USER_ID;

  if (!secret || !targetUserId) {
    return NextResponse.json(
      { error: "Webhook não configurado. Defina N8N_WEBHOOK_SECRET e N8N_TARGET_USER_ID no .env." },
      { status: 501 }
    );
  }

  const receivedSecret = req.headers.get("x-webhook-secret") ?? "";
  const secretBuf = Buffer.from(secret);
  const receivedBuf = Buffer.from(receivedSecret);
  const lengthsMatch = secretBuf.length === receivedBuf.length;
  const safeReceived = lengthsMatch ? receivedBuf : Buffer.alloc(secretBuf.length);
  const valid = lengthsMatch && timingSafeEqual(secretBuf, safeReceived);

  if (!valid) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    return NextResponse.json(
      { error: "N8N_TARGET_USER_ID não corresponde a nenhum usuário." },
      { status: 500 }
    );
  }

  const settings = await getAppSettings();

  try {
    const body = await req.json();
    const { description, url, source } = body as {
      description: string;
      // URL original da vaga — opcional, aparece nos detalhes da vaga no dashboard
      url?: string;
      // Fonte de onde a vaga veio — para rastreabilidade
      source?: JobSource;
    };

    if (!description || typeof description !== "string" || description.trim().length < 20) {
      return NextResponse.json(
        { error: "Campo 'description' ausente ou muito curto (mínimo 20 caracteres)." },
        { status: 400 }
      );
    }

    if (description.length > settings.maxDescriptionLength) {
      return NextResponse.json(
        { error: `Descrição muito longa (limite: ${settings.maxDescriptionLength} chars).` },
        { status: 400 }
      );
    }

    // Valida URL se fornecida
    if (url && typeof url === "string") {
      try {
        new URL(url);
      } catch {
        return NextResponse.json(
          { error: "Campo 'url' inválido — deve ser uma URL completa (https://...)." },
          { status: 400 }
        );
      }
    }

    // Valida source se fornecido
    const validSource = source && VALID_SOURCES.includes(source) ? source : "manual";

    const analysis = await analyzeJobWithGemini(description);

    if (!isValidAnalysis(analysis)) {
      return NextResponse.json(
        { error: "A IA retornou um formato inesperado. Tente novamente." },
        { status: 500 }
      );
    }

    const approxTokens = Math.ceil(description.length / 4);
    await logAiUsage({
      userId: targetUser.id,
      action: `analyze_job_webhook_${validSource}`,
      tokens: approxTokens,
    });

    const job = await prisma.job.create({
      data: {
        userId: targetUser.id,
        description,
        company: analysis.company,
        title: analysis.title,
        summary: analysis.summary,
        requirements: stringifyArray(analysis.requirements),
        technologies: stringifyArray(analysis.technologies),
        questions: stringifyArray(analysis.questions),
        checklist: stringifyArray(analysis.checklist),
        // url e source salvos se fornecidos pelo n8n
        ...(url ? { url } : {}),
      },
    });

    console.log(`[webhook] vaga criada via ${validSource}: ${analysis.title} @ ${analysis.company}`);

    return NextResponse.json(
      { ...mapJob(job), source: validSource },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro no webhook n8n:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
