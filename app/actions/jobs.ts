"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseArray, parseIndexArray, stringifyArray } from "@/lib/json";
import { JobStatus, JobLocation } from "@prisma/client";
import type { CreateJobRequest } from "@/types/job";

async function requireOwnership(jobId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== session.user.id) return null;
  return job;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// A criação precisa ser Server Action (e não Route Handler): só Server Actions
// invalidam o Client Router Cache via revalidatePath. Em Route Handler o
// revalidatePath marca apenas o Data Cache do servidor, então com
// staleTimes.dynamic de 300s o dashboard continuaria servindo a lista antiga.
export async function createJob(
  input: CreateJobRequest
): Promise<{ ok: true; id: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Não autenticado." };

  const { description, company, title, url, location, salary, appliedAt } = input;

  if (!description || !company || !title) {
    return { error: "Dados incompletos para salvar a vaga." };
  }

  if (url && url.trim() !== "" && !isValidUrl(url)) {
    return { error: "URL da vaga inválida. Use um link completo (https://...)." };
  }

  if (location && !Object.values(JobLocation).includes(location)) {
    return { error: "Modalidade de local inválida." };
  }

  let parsedAppliedAt: Date | undefined;
  if (appliedAt) {
    const d = new Date(appliedAt);
    if (isNaN(d.getTime())) return { error: "Data de candidatura inválida." };
    parsedAppliedAt = d;
  }

  try {
    const job = await prisma.job.create({
      data: {
        userId: session.user.id,
        description,
        company,
        title,
        summary: input.summary ?? null,
        requirements: stringifyArray(input.requirements),
        differentials: stringifyArray(input.differentials ?? []),
        technologies: stringifyArray(input.technologies),
        questions: stringifyArray(input.questions),
        checklist: stringifyArray(input.checklist),
        url: url && url.trim() !== "" ? url.trim() : null,
        location: location ?? JobLocation.NAO_INFORMADO,
        salary: salary && salary.trim() !== "" ? salary.trim() : null,
        ...(parsedAppliedAt ? { appliedAt: parsedAppliedAt } : {}),
      },
    });

    revalidatePath("/");
    return { ok: true, id: job.id };
  } catch (error) {
    console.error("Erro ao salvar vaga:", error);
    return { error: "Não foi possível salvar a vaga." };
  }
}

// "Tenho interesse" em /monitoradas: move a vaga para o dashboard principal.
// appliedAt passa a ser hoje — e não o dia em que o n8n coletou a vaga.
export async function markJobInterested(
  jobId: string
): Promise<{ ok: true } | { error: string }> {
  const job = await requireOwnership(jobId);
  if (!job) return { error: "Vaga não encontrada." };

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.APLICADA, appliedAt: new Date() },
    });
    revalidatePath("/");
    revalidatePath("/monitoradas");
    return { ok: true };
  } catch {
    return { error: "Não foi possível mover a vaga para o dashboard." };
  }
}

export async function updateJobStatus(
  jobId: string,
  status: string
): Promise<{ ok: true } | { error: string }> {
  if (!Object.values(JobStatus).includes(status as JobStatus)) {
    return { error: "Status inválido." };
  }

  const job = await requireOwnership(jobId);
  if (!job) return { error: "Vaga não encontrada." };

  try {
    await prisma.job.update({ where: { id: jobId }, data: { status: status as JobStatus } });
    revalidatePath("/");
    revalidatePath("/monitoradas");
    return { ok: true };
  } catch {
    return { error: "Não foi possível atualizar o status." };
  }
}

export async function updateJobMeta(
  jobId: string,
  data: { url?: string; location?: string; salary?: string; appliedAt?: string }
): Promise<{ ok: true } | { error: string }> {
  const job = await requireOwnership(jobId);
  if (!job) return { error: "Vaga não encontrada." };

  const update: {
    url?: string | null;
    location?: JobLocation;
    salary?: string | null;
    appliedAt?: Date;
  } = {};

  if (data.url !== undefined) {
    if (data.url.trim() !== "") {
      try {
        new URL(data.url);
      } catch {
        return { error: "URL da vaga inválida. Use um link completo (https://...)." };
      }
    }
    update.url = data.url.trim() === "" ? null : data.url.trim();
  }

  if (data.location !== undefined) {
    if (!Object.values(JobLocation).includes(data.location as JobLocation)) {
      return { error: "Modalidade de local inválida." };
    }
    update.location = data.location as JobLocation;
  }

  if (data.salary !== undefined) {
    update.salary = data.salary.trim() === "" ? null : data.salary.trim();
  }

  if (data.appliedAt !== undefined) {
    const d = new Date(data.appliedAt);
    if (isNaN(d.getTime())) return { error: "Data de candidatura inválida." };
    update.appliedAt = d;
  }

  if (Object.keys(update).length === 0) {
    return { error: "Nenhum campo válido para atualizar." };
  }

  try {
    await prisma.job.update({ where: { id: jobId }, data: update });
    revalidatePath("/");
    return { ok: true };
  } catch {
    return { error: "Não foi possível salvar." };
  }
}

// Marca/desmarca um item do checklist. Lê o estado atual do banco e altera só
// o índice pedido, então dois cliques rápidos em itens diferentes não se
// sobrescrevem com uma lista inteira desatualizada vinda do cliente.
export async function toggleChecklistItem(
  jobId: string,
  index: number,
  done: boolean
): Promise<{ ok: true } | { error: string }> {
  const job = await requireOwnership(jobId);
  if (!job) return { error: "Vaga não encontrada." };

  const total = parseArray(job.checklist).length;
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    return { error: "Item do checklist inválido." };
  }

  const current = new Set(parseIndexArray(job.checklistDone));
  if (done) current.add(index);
  else current.delete(index);

  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { checklistDone: stringifyArray([...current].sort((a, b) => a - b)) },
    });
    revalidatePath(`/vaga/${jobId}`);
    return { ok: true };
  } catch {
    return { error: "Não foi possível salvar o checklist." };
  }
}

export async function deleteJob(
  jobId: string
): Promise<{ ok: true } | { error: string }> {
  const job = await requireOwnership(jobId);
  if (!job) return { error: "Vaga não encontrada." };

  try {
    await prisma.job.delete({ where: { id: jobId } });
    revalidatePath("/");
    revalidatePath("/monitoradas");
    return { ok: true };
  } catch {
    return { error: "Não foi possível excluir a vaga." };
  }
}
