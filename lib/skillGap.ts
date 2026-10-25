import { SKILL_ALIASES } from "@/lib/skillAliases";

// Chave de compara\u00e7\u00e3o: sem caixa, acento, espa\u00e7o, ponto, h\u00edfen e underline
// ("Node.js" = "NodeJS" = "node js"), depois resolvida pelos sin\u00f4nimos de
// lib/skillAliases.ts ("JS" = "JavaScript", "React.js" = "React").
function skillKey(value: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[\s._-]+/g, "");
  return SKILL_ALIASES[key] ?? key;
}

export interface SkillGapResult {
  known: string[];
  missing: string[];
}

// Compara as tecnologias exigidas pela vaga com as skills do perfil do
// usuário logado (UserProfile.skills). Match exato depois de skillKey() —
// não é fuzzy match; sinônimo novo entra em lib/skillAliases.ts.
//
// IMPORTANTE: `userSkills` deve vir sempre do perfil do usuário autenticado
// que está vendo a tela — nunca comparar com o perfil de outro usuário.
export function compareSkills(requiredTechnologies: string[], userSkills: string[]): SkillGapResult {
  const knownKeys = new Set(userSkills.map(skillKey));

  const known: string[] = [];
  const missing: string[] = [];

  for (const tech of requiredTechnologies) {
    if (knownKeys.has(skillKey(tech))) {
      known.push(tech);
    } else {
      missing.push(tech);
    }
  }

  return { known, missing };
}
