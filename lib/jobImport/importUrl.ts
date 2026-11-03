import { isBlockedHost } from "@/lib/jobImport/blockedSites";
import { extractFromGithubIssue, extractFromHtml, githubIssueApi, pageProblem, type Extracted } from "@/lib/jobImport/extract";
import {
  IMPORT_LIMITS,
  type ImportAviso,
  type ImportFallbackReason,
  type ImportResponse,
} from "@/lib/jobImport/types";
import { parsePublicUrl, safeFetch, SafeFetchError, type SafeFetchResult } from "@/lib/safeFetch";

// Lógica de POST /api/vaga/importar, sem Next nem sessão, para os testes
// trocarem a rede e o banco. A rota cuida de login, corpo e limites.

export const IMPORT_MESSAGES: Record<ImportFallbackReason, string> = {
  site_bloqueado: "Esse site não permite leitura automática. Copie o texto da vaga e cole aqui.",
  url_recusada: "Esse endereço não pode ser lido pelo VagaSync. Copie o texto da vaga e cole aqui.",
  acesso_negado: "O site recusou a leitura automática desta página. Copie o texto da vaga e cole aqui.",
  desafio_ou_captcha: "O site pediu uma verificação de segurança. Copie o texto da vaga e cole aqui.",
  exige_login: "Essa página só abre com login no site. Copie o texto da vaga e cole aqui.",
  pagina_so_javascript: "Não encontramos o texto da vaga nesta página. Copie o texto e cole aqui.",
  tempo_esgotado: "O site demorou demais para responder. Tente de novo ou cole o texto da vaga.",
  pagina_grande_demais: "A página é grande demais para ler. Copie o texto da vaga e cole aqui.",
  formato_nao_suportado: "Esse link não leva a uma página de vaga (pode ser um PDF ou outro arquivo). Copie o texto e cole aqui.",
  leitura_falhou: "Não foi possível ler esta página. Copie o texto da vaga e cole aqui.",
};

const NOT_FOUND_MESSAGE = "A página não foi encontrada. A vaga pode ter sido encerrada; se ela ainda existir, cole o texto aqui.";

// Parâmetros de rastreio que mudam o link sem mudar a vaga ("?jobBoardSource=..."
// da Gupy, "utm_*"). Saem antes de procurar duplicata e do link salvo.
const TRACKING_PARAMS = /^(utm_\w+|jobboardsource|gh_src|trk|trackingid|refid|fbclid|gclid|mc_cid|mc_eid)$/i;

export function canonicalUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  for (const key of [...copy.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) copy.searchParams.delete(key);
  }
  return copy.href;
}

export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Corta no fim de uma linha ou palavra, sem passar do limite.
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const at = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  return (at > max * 0.8 ? slice.slice(0, at) : slice).trimEnd();
}

function fallback(motivo: ImportFallbackReason, url: string, mensagem = IMPORT_MESSAGES[motivo]): ImportResponse {
  return { status: "colar_texto", motivo, mensagem, url };
}

function statusReason(status: number): ImportFallbackReason | null {
  if (status >= 200 && status < 300) return null;
  if ([401, 403, 407, 429, 451, 999].includes(status)) return "acesso_negado";
  return "leitura_falhou";
}

export type ImportDeps = {
  // Procura entre as vagas da conta; devolve o id da primeira com um destes links.
  findJobByUrl: (urls: string[]) => Promise<string | null>;
  // Reserva a cota de importação. false = limite atingido (a rota responde 429).
  reserve: () => Promise<boolean>;
  fetchPage?: (url: string) => Promise<SafeFetchResult>;
  maxTextChars: number;
};

export type ImportOutcome = ImportResponse | { status: "limite" };

export class InvalidImportUrl extends Error {}

// Só aceita http/https bem formado; o resto é 400 na rota.
export function readImportUrl(value: unknown): URL {
  if (typeof value !== "string") throw new InvalidImportUrl("Informe o link da vaga.");
  const raw = value.trim();
  if (!raw) throw new InvalidImportUrl("Informe o link da vaga.");
  if (raw.length > IMPORT_LIMITS.urlChars) throw new InvalidImportUrl(`Link longo demais (limite de ${IMPORT_LIMITS.urlChars} caracteres).`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidImportUrl("Link inválido. Use o endereço completo da vaga (https://...).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidImportUrl("Link inválido. Use o endereço completo da vaga (https://...).");
  }
  return url;
}

export async function importJobFromUrl(input: URL, deps: ImportDeps): Promise<ImportOutcome> {
  const fetchPage = deps.fetchPage ?? ((url: string) => safeFetch(url, { isBlockedHost }));
  const link = canonicalUrl(input);
  const typed = new URL(input.href);
  typed.hash = "";

  const existing = await deps.findJobByUrl([...new Set([link, typed.href])]);
  if (existing) return { status: "duplicada", jobId: existing };

  if (isBlockedHost(input.hostname)) return fallback("site_bloqueado", link);
  try {
    parsePublicUrl(link);
  } catch {
    return fallback("url_recusada", link);
  }

  if (!(await deps.reserve())) return { status: "limite" };

  const githubApi = githubIssueApi(input);
  let page: SafeFetchResult;
  try {
    page = await fetchPage(githubApi ?? link);
  } catch (error) {
    const code = error instanceof SafeFetchError ? error.code : "leitura_falhou";
    const where = error instanceof SafeFetchError && error.url && !githubApi ? canonicalUrl(new URL(error.url)) : link;
    console.warn(`[importar] ${siteOf(link)}: ${code}`);
    return fallback(code, where);
  }

  const urlFinal = githubApi ? link : canonicalUrl(new URL(page.url));
  if (urlFinal !== link) {
    const again = await deps.findJobByUrl([urlFinal]);
    if (again) return { status: "duplicada", jobId: again };
  }

  const bad = statusReason(page.status);
  if (bad) {
    console.warn(`[importar] ${siteOf(urlFinal)}: HTTP ${page.status}`);
    if (page.contentType.includes("html") && pageProblem(page.body, 0) === "desafio_ou_captcha") {
      return fallback("desafio_ou_captcha", urlFinal);
    }
    if (page.status === 404 || page.status === 410) return fallback("leitura_falhou", urlFinal, NOT_FOUND_MESSAGE);
    return fallback(bad, urlFinal);
  }

  let extracted: Extracted | null;
  if (githubApi) {
    extracted = extractFromGithubIssue(page.body);
  } else if (page.contentType.includes("json")) {
    // JSON solto (sem página): sem formato conhecido, não há o que ler.
    extracted = null;
  } else {
    extracted = extractFromHtml(page.body);
    const problem = pageProblem(page.body, extracted.texto.length);
    if (problem) return fallback(problem, urlFinal);
  }
  if (!extracted || extracted.texto.trim() === "") return fallback("pagina_so_javascript", urlFinal);

  const avisos: ImportAviso[] = [];
  const max = Math.min(deps.maxTextChars, IMPORT_LIMITS.textChars);
  const texto = cut(extracted.texto, max);
  if (texto.length < extracted.texto.length) avisos.push("texto_cortado");
  if (texto.length < IMPORT_LIMITS.minTextChars) avisos.push("texto_incompleto");

  return {
    status: "ok",
    vaga: {
      texto,
      titulo: extracted.titulo,
      empresa: extracted.empresa,
      urlFinal,
      site: siteOf(urlFinal),
      avisos,
    },
  };
}
