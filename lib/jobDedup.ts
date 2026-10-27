// Deduplicação das vagas que chegam pelo webhook do n8n, sempre dentro das
// vagas de um mesmo usuário. Duas regras, nesta ordem:
//
// 1. Mesma URL: a vaga reaparece no feed entre rodadas.
// 2. Mesmo título e mesma empresa (sem acento, caixa, pontuação e espaços
//    extras) vindos de OUTRA origem nos últimos DEDUP_WINDOW_DAYS dias: a
//    mesma vaga anunciada em fontes diferentes (ex: Remotar e Himalayas) tem
//    URLs diferentes. Título e empresa iguais no MESMO site, com URL
//    diferente, são postagens distintas (ex: duas turmas de estágio) e entram.
//
// Empresa vazia ou genérica ("Confidencial") nunca casa: sem empresa
// conhecida não dá para dizer que é a mesma vaga.
//
// Módulo puro (sem Prisma nem aliases) para rodar nos testes com `node --test`.

export const DEDUP_WINDOW_DAYS = 30;

const GENERIC_COMPANIES = new Set([
  "confidencial",
  "empresa confidencial",
  "nao informado",
  "nao informada",
  "sigiloso",
  "sigilosa",
  "anonimo",
  "anonima",
  "n a",
]);

export type DedupCandidate = {
  url?: string | null;
  title?: string | null;
  company?: string | null;
};

export type ExistingJob = {
  id: string;
  url: string | null;
  title: string;
  company: string;
  createdAt: Date;
};

export type DuplicateMatch = { id: string; reason: "url" | "titulo_empresa" };

// "  Estágio em TI – Grupo CÉV " → "estagio em ti grupo cev". Vazio → null.
export function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return text === "" ? null : text;
}

export function normalizeCompany(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text || GENERIC_COMPANIES.has(text) || text.startsWith("confidencial ")) return null;
  return text;
}

export function normalizeUrl(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// Origem da vaga = host da URL ("" sem URL, ex: vaga colada à mão).
function origin(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function findDuplicate(
  candidate: DedupCandidate,
  existing: ExistingJob[],
  now: number = Date.now()
): DuplicateMatch | null {
  const url = normalizeUrl(candidate.url);
  if (url) {
    const sameUrl = existing.find((job) => job.url === url);
    if (sameUrl) return { id: sameUrl.id, reason: "url" };
  }

  const title = normalizeText(candidate.title);
  const company = normalizeCompany(candidate.company);
  if (!title || !company) return null;

  const since = now - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const from = origin(url);
  const match = existing.find(
    (job) =>
      job.createdAt.getTime() >= since &&
      normalizeText(job.title) === title &&
      normalizeCompany(job.company) === company &&
      // mesma origem com URL diferente = outra postagem; sem URL nos dois
      // lados não há como separar, então conta como a mesma
      (origin(job.url) !== from || (!job.url && !url))
  );
  return match ? { id: match.id, reason: "titulo_empresa" } : null;
}
