import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { JobStatus, JobLocation, Prisma } from "@prisma/client";
import { UpdateJobRequest } from "@/types/job";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

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

  const body: UpdateJobRequest = await req.json();
  const { status, url, location, salary, appliedAt } = body;

  const data: Prisma.JobUpdateInput = {};

  if (status !== undefined) {
    if (typeof status !== "string" || !Object.values(JobStatus).includes(status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    data.status = status;
  }

  if (url !== undefined) {
    if (url.trim() !== "" && !isValidUrl(url)) {
      return NextResponse.json(
        { error: "URL da vaga inválida. Use um link completo (https://...)." },
        { status: 400 }
      );
    }
    data.url = url.trim() === "" ? null : url.trim();
  }

  if (location !== undefined) {
    if (!Object.values(JobLocation).includes(location)) {
      return NextResponse.json({ error: "Modalidade de local inválida." }, { status: 400 });
    }
    data.location = location;
  }

  if (salary !== undefined) {
    data.salary = salary.trim() === "" ? null : salary.trim();
  }

  if (appliedAt !== undefined) {
    const d = new Date(appliedAt);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "Data de candidatura inválida." }, { status: 400 });
    }
    data.appliedAt = d;
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
