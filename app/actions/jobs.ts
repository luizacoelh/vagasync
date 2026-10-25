"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseArray, parseIndexArray, stringifyArray } from "@/lib/json";
import { JobStatus, JobLocation, Prisma } from "@prisma/client";
import type { CreateJobRequest } from "@/types/job";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

// Atualiza a vaga só se ela for do usuário logado, numa ida ao banco: o dono
// vai no WHERE em vez de um findUnique antes. Retorna false se a vaga não
// existe ou é de outra pessoa (as duas respondem igual, sem vazar qual).
async function updateOwnJob(jobId: string, data: Prisma.JobUpdateManyMutationInput): Promise<boolean> {
  const userId = await requireUserId();
  const { count } = await prisma.job.updateMany({ where: { id: jobId, userId }, data });
  return count > 0;
}

// Seleção em lote vem do cliente: aceita só strings, sem repetição e com teto,
// para uma chamada forjada não virar um UPDATE/DELETE gigante.
const MAX_BATCH = 200;
function cleanIds(jobIds: unknown): string[] | null {
  if (!Array.isArray(jobIds) || jobIds.length === 0 || jobIds.length > MAX_BATCH) return null;
  if (!jobIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)) return null;
  return [...new Set(jobIds as string[])];
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

// "Tenho interesse" em /monitoradas (uma ou várias vagas): move para o
// dashboard principal. appliedAt passa a ser hoje — e não o dia em que o n8n
// coletou a vaga. Só vale para vagas MONITORADAS.
export async function markJobsInterested(
  jobIds: string[]
): Promise<{ ok: true; count: number } | { error: string }> {
  const ids = cleanIds(jobIds);
  if (!ids) return { error: "Seleção inválida." };
  const userId = await requireUserId();

  try {
    const { count } = await prisma.job.updateMany({
      where: { id: { in: ids }, userId, status: JobStatus.MONITORADA },
      data: { status: JobStatus.APLICADA, appliedAt: new Date() },
    });
    if (count === 0) return { error: "Vaga não encontrada." };
    revalidatePath("/");
    revalidatePath("/monitoradas");
    for (const id of ids) revalidatePath(`/vaga/${id}`);
    return { ok: true, count };
  } catch {
    return { error: "Não foi possível mover para o dashboard." };
  }
}

export async function updateJobStatus(
  jobId: string,
  status: string
): Promise<{ ok: true } | { error: string }> {
  if (!Object.values(JobStatus).includes(status as JobStatus)) {
    return { error: "Status inválido." };
  }

  try {
    const updated = await updateOwnJob(jobId, { status: status as JobStatus });
    if (!updated) return { error: "Vaga não encontrada." };
    revalidatePath("/");
    revalidatePath("/monitoradas");
    revalidatePath(`/vaga/${jobId}`);
    return { ok: true };
  } catch {
    return { error: "Não foi possível atualizar o status." };
  }
}

export async function updateJobMeta(
  jobId: string,
  data: { url?: string; location?: string; salary?: string; appliedAt?: string }
): Promise<{ ok: true } | { error: string }> {
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
    const updated = await updateOwnJob(jobId, update);
    if (!updated) return { error: "Vaga não encontrada." };
    revalidatePath("/");
    revalidatePath(`/vaga/${jobId}`);
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
  const userId = await requireUserId();
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { checklist: true, checklistDone: true },
  });
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

// Exclusão definitiva (uma ou várias vagas). Usada no dashboard e na página
// da vaga; em /monitoradas o caminho é descartar, que não apaga.
export async function deleteJobs(
  jobIds: string[]
): Promise<{ ok: true; count: number } | { error: string }> {
  const ids = cleanIds(jobIds);
  if (!ids) return { error: "Seleção inválida." };
  const userId = await requireUserId();

  try {
    const { count } = await prisma.job.deleteMany({ where: { id: { in: ids }, userId } });
    if (count === 0) return { error: "Vaga não encontrada." };
    revalidatePath("/");
    revalidatePath("/monitoradas");
    return { ok: true, count };
  } catch {
    return { error: "Não foi possível excluir." };
  }
}

// "Descartar" em /monitoradas (uma ou várias vagas): não apaga. A vaga fica
// no banco como DESCARTADA para a deduplicação por URL do webhook continuar
// reconhecendo e o n8n não a recriar na próxima rodada. Só vale para MONITORADAS.
export async function discardJobs(
  jobIds: string[]
): Promise<{ ok: true; count: number } | { error: string }> {
  return moveStatus(jobIds, JobStatus.MONITORADA, JobStatus.DESCARTADA, "Não foi possível descartar.");
}

// "Desfazer" do descarte: devolve as vagas para /monitoradas.
export async function restoreDiscardedJobs(
  jobIds: string[]
): Promise<{ ok: true; count: number } | { error: string }> {
  return moveStatus(jobIds, JobStatus.DESCARTADA, JobStatus.MONITORADA, "Não foi possível restaurar.");
}

async function moveStatus(
  jobIds: string[],
  from: JobStatus,
  to: JobStatus,
  failMessage: string
): Promise<{ ok: true; count: number } | { error: string }> {
  const ids = cleanIds(jobIds);
  if (!ids) return { error: "Seleção inválida." };
  const userId = await requireUserId();

  try {
    const { count } = await prisma.job.updateMany({
      where: { id: { in: ids }, userId, status: from },
      data: { status: to },
    });
    if (count === 0) return { error: "Vaga não encontrada." };
    revalidatePath("/monitoradas");
    revalidatePath("/");
    return { ok: true, count };
  } catch {
    return { error: failMessage };
  }
}
