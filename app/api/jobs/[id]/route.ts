import { JobInputError } from "@/lib/jobCreation";
import { jobMeta, readJobJson } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { JobStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

// Busca a vaga já garantindo que pertence ao usuário logado. Se a vaga
// existir mas for de outra pessoa, devolvemos 404 (não 403) de propósito —
// não queremos confirmar pra quem não tem acesso que aquele id existe.
async function findOwnedJob(id: string, userId: string) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || job.userId !== userId) return null;
  return job;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const job = await findOwnedJob(id, user.id);

  if (!job) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  return NextResponse.json(mapJob(job));
}

// PATCH aceita atualização parcial: status, url, location, salary, appliedAt.
// Só os campos enviados no body são alterados — os demais permanecem como estão.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await findOwnedJob(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  let data: Prisma.JobUpdateInput;
  try {
    const input = await readJobJson(req);
    data = jobMeta(input);
    body = input as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ error: error instanceof JobInputError ? error.message : "Dados inválidos." }, { status: 400 });
  }
  const { status } = body;

  if (status !== undefined) {
    if (typeof status !== "string" || !Object.values(JobStatus).includes(status as JobStatus)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    data.status = status as JobStatus;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
  }

  try {
    const job = await prisma.job.update({ where: { id }, data });
    return NextResponse.json(mapJob(job));
  } catch (error) {
    console.error("Erro ao atualizar vaga:", error);
    return NextResponse.json({ error: "Não foi possível atualizar a vaga." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const existing = await findOwnedJob(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  }

  try {
    await prisma.job.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao excluir vaga:", error);
    return NextResponse.json({ error: "Não foi possível excluir a vaga." }, { status: 500 });
  }
}
