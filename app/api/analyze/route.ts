import { readJobJson, object } from "@/lib/jobInput";
import { checkJobCreationQuota, JobInputError, JobQuotaError } from "@/lib/jobCreation";
import { NextRequest, NextResponse } from "next/server";
import { analyzeJobWithGemini } from "@/lib/gemini";
import { requireUser } from "@/lib/apiAuth";
import { checkAndConsumeGeminiQuota } from "@/lib/rateLimit";
import { checkIpRateLimit, getClientIp } from "@/lib/ipRateLimit";
import { getAppSettings } from "@/lib/appSettings";

// A chamada ao Gemini já levou entre 16s e 27s em teste (com retry de rate
// limit). O padrão da Vercel para funções serverless costuma ser bem menor
// que isso — sem esse export, a requisição pode ser encerrada (504) antes da
// IA responder. Precisa rodar em Node.js (não Edge) por causa do driver do
// banco usado em outras rotas do projeto.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const settings = await getAppSettings();

  try {
    const { description } = object(await readJobJson(req));

    if (!description || typeof description !== "string" || description.trim().length < 20) {
      return NextResponse.json(
        { error: "Descrição da vaga muito curta ou ausente." },
        { status: 400 }
      );
    }

    if (description.length > Math.min(settings.maxDescriptionLength, 8000)) {
      return NextResponse.json(
        {
          error: `Descrição muito longa (${description.length} caracteres, limite de ${Math.min(settings.maxDescriptionLength, 8000)}). Cole só o texto da vaga, sem conteúdo extra da página.`,
        },
        { status: 400 }
      );
    }

    // Sem cota de cadastro a vaga não poderia ser salva: não gasta IA à toa.
    await checkJobCreationQuota(user.id, "manual");

    const quota = await checkAndConsumeGeminiQuota(user.id);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Limite diário de análises por IA atingido (${quota.limit}/dia). Tente novamente amanhã.`,
        },
        { status: 429 }
      );
    }

    const ipCheck = await checkIpRateLimit(getClientIp(req), user.id, Math.ceil(description.length / 4));
    if (ipCheck.reason === "site") {
      return NextResponse.json(
        { error: "A análise por IA está temporariamente limitada. Tente novamente mais tarde." },
        { status: 429, headers: { "Retry-After": "3600" } }
      );
    }
    if (!ipCheck.allowed) return NextResponse.json({ error: "Limite de analises por IP atingido." }, { status: 429 });

    const analysis = await analyzeJobWithGemini(description);

    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof JobInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof JobQuotaError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("Erro ao analisar vaga:", error);
    return NextResponse.json({ error: "Nao foi possivel analisar a vaga. Tente novamente." }, { status: 500 });
  }
}
