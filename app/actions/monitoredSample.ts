"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createLimitedJob, JobInputError, JobQuotaError } from "@/lib/jobCreation";
import { sampleHoursLeftFor, sampleTargetUserId, SAMPLE_DAYS } from "@/lib/monitoredSample";

// "Tenho interesse" na amostra de /monitoradas: copia a vaga do robô para a
// conta de quem vê, como cadastro manual (mesma cota de lib/jobCreation.ts) e
// sem chamar a IA, porque a análise já existe. Só vale durante a amostra e para
// vagas que estão na amostra (conta-alvo, MONITORADA, últimos SAMPLE_DAYS dias).
export async function copySampleJob(jobId: unknown): Promise<{ ok: true; id: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Não autenticado." };
  const userId = session.user.id;
  if (typeof jobId !== "string" || !jobId || jobId.length > 64) return { error: "Vaga não encontrada." };

  const target = sampleTargetUserId();
  if (!target || (await sampleHoursLeftFor(userId)) <= 0) {
    return { error: "A amostra de vagas monitoradas terminou para a sua conta." };
  }

  try {
    const source = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId: target,
        status: "MONITORADA",
        createdAt: { gte: new Date(Date.now() - SAMPLE_DAYS * 24 * 3600000) },
      },
      select: {
        company: true,
        title: true,
        description: true,
        url: true,
        location: true,
        salary: true,
        summary: true,
        requirements: true,
        differentials: true,
        technologies: true,
        questions: true,
        checklist: true,
        recruiterProfile: true,
        skillsToStudy: true,
      },
    });
    if (!source) return { error: "Essa vaga saiu da amostra." };

    if (source.url) {
      const existing = await prisma.job.findFirst({ where: { userId, url: source.url }, select: { id: true } });
      if (existing) return { ok: true, id: existing.id };
    }

    const job = await createLimitedJob({ ...source, userId, status: "APLICADA", appliedAt: new Date() }, "manual");
    revalidatePath("/");
    return { ok: true, id: job.id };
  } catch (error) {
    if (error instanceof JobInputError || error instanceof JobQuotaError) return { error: error.message };
    console.error("Erro ao copiar vaga da amostra:", (error as Error)?.message);
    return { error: "Não foi possível salvar a vaga." };
  }
}
