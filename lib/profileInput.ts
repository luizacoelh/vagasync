import { ExperienceLevel } from "@prisma/client";
import { object } from "@/lib/jobInput";
import { JobInputError } from "@/lib/jobCreation";

export function profileInput(value: unknown) {
  const input = object(value);
  const result: { goal?: string | null; interestArea?: string | null; experience?: ExperienceLevel; skills?: string[] } = {};
  for (const field of ["goal", "interestArea"] as const) {
    const v = input[field];
    if (v === undefined) continue;
    if (v !== null && (typeof v !== "string" || v.length > 1000)) throw new JobInputError(`${field}: máximo de 1000 caracteres.`);
    result[field] = typeof v === "string" ? v.trim() || null : null;
  }
  if (input.experience !== undefined) {
    if (typeof input.experience !== "string" || !Object.values(ExperienceLevel).includes(input.experience as ExperienceLevel)) throw new JobInputError("Nível de experiência inválido.");
    result.experience = input.experience as ExperienceLevel;
  }
  if (input.skills !== undefined) {
    if (!Array.isArray(input.skills) || input.skills.length > 100 || input.skills.some(v => typeof v !== "string" || v.length > 100)) throw new JobInputError("Use até 100 habilidades de até 100 caracteres.");
    result.skills = [...new Set((input.skills as string[]).map(v => v.trim()).filter(Boolean))];
  }
  return result;
}
