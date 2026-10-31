import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/apiAuth";
import { limitApi } from "@/lib/apiQuota";
import { parseArray, stringifyArray } from "@/lib/json";
import { ExperienceLevel } from "@prisma/client";
import { profileInput } from "@/lib/profileInput";
import { readJobJson } from "@/lib/jobInput";
import { JobInputError } from "@/lib/jobCreation";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = await limitApi(user.id);
  if (limited) return limited;

  const profile = await prisma.userProfile.findUnique({ where: { userId: user.id } });

  if (!profile) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    goal: profile.goal,
    interestArea: profile.interestArea,
    experience: profile.experience,
    skills: parseArray(profile.skills),
  });
}

// Cria OU atualiza o perfil do usuário logado (upsert) — usado tanto no
// onboarding (primeira vez) quanto na edição posterior em /perfil.
export async function PUT(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = await limitApi(user.id);
  if (limited) return limited;

  try {
    const { goal, interestArea, experience, skills } = profileInput(await readJobJson(req));
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        goal: goal ?? null,
        interestArea: interestArea ?? null,
        experience: experience ?? ExperienceLevel.NAO_INFORMADO,
        skills: stringifyArray(skills ?? []),
      },
      update: {
        ...(goal !== undefined ? { goal: goal } : {}),
        ...(interestArea !== undefined
          ? { interestArea: interestArea }
          : {}),
        ...(experience !== undefined ? { experience } : {}),
        ...(skills !== undefined ? { skills: stringifyArray(skills) } : {}),
      },
    });

    return NextResponse.json({
      goal: profile.goal,
      interestArea: profile.interestArea,
      experience: profile.experience,
      skills: parseArray(profile.skills),
    });
  } catch (error) {
    if (error instanceof JobInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Erro ao salvar perfil:", error);
    return NextResponse.json({ error: "Não foi possível salvar o perfil." }, { status: 500 });
  }
}
