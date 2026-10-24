import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stringifyArray } from "@/lib/json";
import { mapJob } from "@/lib/jobMapper";
import { CreateJobRequest } from "@/types/job";
import { JobLocation } from "@prisma/client";
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

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jobs = await prisma.job.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(jobs.map(mapJob));
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    const body: CreateJobRequest = await req.json();
    const {
      description,
      company,
      title,
      summary,
      requirements,
      technologies,
      questions,
      checklist,
      url,
      location,
      salary,
      appliedAt,
    } = body;

    if (!description || !company || !title) {
      return NextResponse.json(
        { error: "Dados incompletos para salvar a vaga." },
        { status: 400 }
      );
    }

    if (url && url.trim() !== "" && !isValidUrl(url)) {
      return NextResponse.json(
        { error: "URL da vaga inválida. Use um link completo (https://...)." },
        { status: 400 }
      );
    }

    if (location && !Object.values(JobLocation).includes(location)) {
      return NextResponse.json({ error: "Modalidade de local inválida." }, { status: 400 });
    }

    let parsedAppliedAt: Date | undefined;
    if (appliedAt) {
      const d = new Date(appliedAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Data de candidatura inválida." }, { status: 400 });
      }
      parsedAppliedAt = d;
    }

    const data = {
      userId: user.id,
      description,
      company,
      title,
      summary: summary ?? null,
      requirements: stringifyArray(requirements),
      technologies: stringifyArray(technologies),
      questions: stringifyArray(questions),
      checklist: stringifyArray(checklist),
      url: url && url.trim() !== "" ? url.trim() : null,
      location: location ?? JobLocation.NAO_INFORMADO,
      salary: salary && salary.trim() !== "" ? salary.trim() : null,
      ...(parsedAppliedAt ? { appliedAt: parsedAppliedAt } : {}),
    };

    const job = await prisma.job.create({ data });
    return NextResponse.json(mapJob(job), { status: 201 });
  } catch (error) {
    console.error("Erro ao salvar vaga:", error);
    return NextResponse.json(
      { error: "Não foi possível salvar a vaga." },
      { status: 500 }
    );
  }
}
