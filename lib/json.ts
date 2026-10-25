export function parseArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

// Variante para arrays de índices (ex: Job.checklistDone) — descarta o que
// não for inteiro não negativo, para um valor corrompido não quebrar a tela.
export function parseIndexArray(value?: string | null): number[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => Number.isInteger(n) && n >= 0)
      : [];
  } catch {
    return [];
  }
}

export function stringifyArray(value: (string | number)[]): string {
  return JSON.stringify(value);
}