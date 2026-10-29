import { createLimitedJob, JobInputError, JobQuotaError } from "@/lib/jobCreation";
import { jobCreateData, readJobJson } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jobs = await prisma.job.findMany({
    // DESCARTADA só existe para a deduplicação do webhook; não é vaga do usuário.
    where: { userId: user.id, status: { not: "DESCARTADA" } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(jobs.map(mapJob));
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  try {
    const data = jobCreateData(await readJobJson(req), user.id);
    const job = await createLimitedJob(data, "manual");
    return NextResponse.json(mapJob(job), { status: 201 });
  } catch (error) {
    if (error instanceof JobInputError || error instanceof JobQuotaError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status,
        headers: error instanceof JobQuotaError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
      });
    }
    console.error("Erro ao salvar vaga:", error);
    return NextResponse.json({ error: "Não foi possível salvar a vaga." }, { status: 500 });
  }
}
