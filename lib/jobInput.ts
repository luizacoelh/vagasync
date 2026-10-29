import { JobLocation, Prisma } from "@prisma/client";
import { JobInputError } from "@/lib/jobCreation";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JobInputError("Dados da vaga inválidos.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new JobInputError(`Preencha ${field}.`);
    return null;
  }
  if (typeof value !== "string" || value.length > max) throw new JobInputError(`${field}: informe um texto de até ${max} caracteres.`);
  const result = value.trim();
  if (required && !result) throw new JobInputError(`Preencha ${field}.`);
  return result || null;
}

function list(value: unknown, field: string, max: number): string {
  if (value === undefined) return "[]";
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== "string" || v.length > 1000)) {
    throw new JobInputError(`${field}: use até ${max} itens de no máximo 1000 caracteres cada.`);
  }
  return JSON.stringify(value);
}

export function jobMeta(value: unknown) {
  const input = object(value);
  const result: { url?: string | null; salary?: string | null; location?: JobLocation; appliedAt?: Date } = {};
  if (input.url !== undefined) {
    result.url = text(input.url, "Link", 2000);
    if (result.url) {
      let url: URL;
      try { url = new URL(result.url); } catch { throw new JobInputError("URL da vaga inválida. Use um link completo (https://...)."); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new JobInputError("Use um link HTTP ou HTTPS sem credenciais.");
    }
  }
  if (input.salary !== undefined) result.salary = text(input.salary, "Salário", 200);
  if (input.location !== undefined) {
    if (typeof input.location !== "string" || !Object.values(JobLocation).includes(input.location as JobLocation)) throw new JobInputError("Modalidade de local inválida.");
    result.location = input.location as JobLocation;
  }
  if (input.appliedAt !== undefined) {
    if (typeof input.appliedAt !== "string" || input.appliedAt.length > 40 || !Number.isFinite(Date.parse(input.appliedAt))) throw new JobInputError("Data de candidatura inválida.");
    result.appliedAt = new Date(input.appliedAt);
  }
  return result;
}

export function jobCreateData(value: unknown, userId: string): Prisma.JobUncheckedCreateInput {
  const input = object(value);
  const data = {
    userId,
    title: text(input.title, "Título", 200, true)!,
    company: text(input.company, "Empresa", 200, true)!,
    description: text(input.description, "Descrição", 8000, true)!,
    summary: text(input.summary, "Resumo", 2000),
    requirements: list(input.requirements, "Requisitos", 20),
    differentials: list(input.differentials, "Diferenciais", 20),
    technologies: list(input.technologies, "Tecnologias", 30),
    questions: list(input.questions, "Perguntas", 10),
    checklist: list(input.checklist, "Checklist", 10),
    ...jobMeta(input),
  };
  if (JSON.stringify(data).length > 32000) throw new JobInputError("O conteúdo total da vaga é muito grande. Reduza os textos e tente novamente.");
  return data;
}

// Limita o corpo real, mesmo sem Content-Length, antes de fazer JSON.parse.
export async function readJobJson(req: Request, maxBytes = 65536): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new JobInputError("Corpo da requisição ausente.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new JobInputError(`Requisição muito grande (máximo ${maxBytes} bytes).`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new JobInputError("JSON inválido."); }
  } finally { reader.releaseLock(); }
}
