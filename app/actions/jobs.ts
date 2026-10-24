"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JobStatus, JobLocation } from "@prisma/client";

async function requireOwnership(jobId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Não autenticado.");

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== session.user.id) return null;
  return job;
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
