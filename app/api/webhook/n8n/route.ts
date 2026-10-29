import { createLimitedJob, checkJobCreationQuota, JobInputError, JobQuotaError } from "@/lib/jobCreation";
import { jobCreateData, jobMeta, readJobJson } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { mapJob } from "@/lib/jobMapper";
import { analyzeJobWithGemini } from "@/lib/gemini";
import { logAiUsage } from "@/lib/aiUsage";
import { getAppSettings } from "@/lib/appSettings";
import { JobAnalysis } from "@/types/job";
import { findDuplicate, normalizeUrl } from "@/lib/jobDedup";
import { authorizeN8n, loadDedupJobs, optionalText } from "@/lib/n8nWebhook";

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

// Provedor de onde o n8n tirou a vaga (gupy, remotar...): vai só para o log,
// a resposta e AiUsage.action. Não é gravado em Job.source, que guarda o canal
// de entrada ("manual" | "n8n"); o provedor sai do host da URL.
const VALID_SOURCES = ["indeed", "weworkremotely", "github", "himalayas", "remotar", "gupy", "infojobs", "catho", "gmail", "manual"] as const;
type JobSource = typeof VALID_SOURCES[number];

export async function POST(req: NextRequest) {
  const auth = await authorizeN8n(req);
  if (auth.response) return auth.response;
  const userId = auth.userId;

  const settings = await getAppSettings();

  try {
    const input = await readJobJson(req);
    jobMeta(input); // valida objeto e URL antes de normalizar ou chamar IA
    const body = input as Record<string, unknown>;
    const { description, url, source } = body as {
      description: string;
      // URL original da vaga — opcional, aparece nos detalhes da vaga no dashboard
      url?: string;
      // Fonte de onde a vaga veio — para rastreabilidade
      source?: JobSource;
    };
    // Título e empresa como a fonte publicou — opcionais, só para deduplicar
    // antes da IA (lib/jobDedup.ts). O que fica salvo é o que a IA extrai.
    const title = optionalText(body.title);
    const company = optionalText(body.company);

    if (!description || typeof description !== "string" || description.trim().length < 20) {
      return NextResponse.json(
        { error: "Campo 'description' ausente ou muito curto (mínimo 20 caracteres)." },
        { status: 400 }
      );
    }

    if (description.length > Math.min(settings.maxDescriptionLength, 8000)) {
      return NextResponse.json(
        { error: `Descrição muito longa (limite: ${Math.min(settings.maxDescriptionLength, 8000)} chars).` },
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

    // Deduplicação antes do Gemini (mesma URL, ou mesmo título + empresa de
    // outra fonte): cada nova análise gastaria IA à toa. Responde 200 (não
    // erro) para o n8n não tratar como falha.
    const normalizedUrl = normalizeUrl(url);
    const existingJobs = await loadDedupJobs(userId, normalizedUrl ? [normalizedUrl] : []);
    const duplicate = findDuplicate({ url: normalizedUrl, title, company }, existingJobs);
    if (duplicate) {
      console.log(`[webhook] vaga duplicada ignorada (${validSource}, ${duplicate.reason}): ${normalizedUrl ?? title}`);
      return NextResponse.json({ duplicate: true, ...duplicate }, { status: 200 });
    }

    await checkJobCreationQuota(userId, "n8n");
    const analysis = await analyzeJobWithGemini(description);

    if (!isValidAnalysis(analysis)) {
      return NextResponse.json(
        { error: "A IA retornou um formato inesperado. Tente novamente." },
        { status: 500 }
      );
    }

    const approxTokens = Math.ceil(description.length / 4);
    await logAiUsage({
      userId,
      action: `analyze_job_webhook_${validSource}`,
      tokens: approxTokens,
    });

    // Segunda checagem com o título e a empresa que a IA extraiu: pega a fonte
    // que não informa empresa (ex: issues do GitHub). A IA já foi gasta, mas
    // não nasce uma vaga repetida. Recarrega as vagas: a análise leva segundos
    // e outro envio da mesma rodada pode ter gravado a mesma vaga nesse meio
    // tempo (o n8n dispara um envio a cada 8s sem esperar a resposta).
    const afterAi = findDuplicate(
      { url: normalizedUrl, title: analysis.title, company: analysis.company },
      await loadDedupJobs(userId, normalizedUrl ? [normalizedUrl] : [])
    );
    if (afterAi) {
      console.log(`[webhook] vaga duplicada após a IA (${validSource}): ${analysis.title} @ ${analysis.company}`);
      return NextResponse.json({ duplicate: true, ...afterAi }, { status: 200 });
    }

    const data = jobCreateData({ ...analysis, description, url: normalizedUrl ?? undefined }, userId);
    const job = await createLimitedJob({ ...data, status: "MONITORADA" }, "n8n");

    console.log(`[webhook] vaga criada via ${validSource}: ${analysis.title} @ ${analysis.company}`);

    return NextResponse.json(
      { ...mapJob(job), source: validSource },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof JobInputError || error instanceof JobQuotaError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status,
        headers: error instanceof JobQuotaError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
      });
    }
    console.error("Erro no webhook n8n:", error);
    return NextResponse.json({ error: "Não foi possível cadastrar a vaga agora. Tente novamente em instantes." }, { status: 500 });
  }
}
