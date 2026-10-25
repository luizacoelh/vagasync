import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { JobAnalysis, JobLocation } from "@/types/job";

// gemini-3.5-flash-lite — versão menor e mais rápida, ideal para JSON estruturado.
// Se a qualidade das análises cair, trocar de volta para "gemini-3.5-flash".
const GEMINI_MODEL = "gemini-3.5-flash-lite";

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Defina essa variável de ambiente para usar a análise por IA."
    );
  }

  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

// Os delimitadores """ em torno do jobText são a principal mitigação contra
// prompt injection: o modelo vê o texto da vaga como dado, não como instrução.
// A validação de shape abaixo (isValidAnalysis) é a segunda camada: mesmo que
// o modelo seja manipulado a retornar algo fora do esperado, rejeitamos.
const PROMPT_TEMPLATE = (jobText: string) => `Analise a vaga abaixo e retorne APENAS JSON válido, sem markdown.

Formato obrigatório:
{"company":"string","title":"string","summary":"string (2-3 frases)","requirements":["string"],"differentials":["string"],"technologies":["nome da tech"],"questions":["pergunta"],"checklist":["ação"],"salary":"string ou null","location":"REMOTO|HIBRIDO|PRESENCIAL|NAO_INFORMADO"}

Regras: requirements = só o obrigatório. differentials = o que a vaga lista como diferencial, desejável ou "plus" ([] se não houver; não repita requisitos). technologies = só nomes (Java, Docker, SQL). questions = 3 a 5 perguntas de entrevista. checklist = 3 a 5 ações de preparo. salary = valor de salário ou bolsa-auxílio exatamente como a vaga informa, curto (ex: "R$ 1.800/mês", "R$ 4.000 a R$ 5.500 CLT"); null se não houver valor numérico ("compatível com o mercado" = null). location = modalidade de trabalho; NAO_INFORMADO se não estiver claro. Responda em português.

Vaga:
"""
${jobText}
"""`;

function toFriendlyError(error: unknown): Error {
  // O SDK do Google retorna o status HTTP de formas diferentes dependendo
  // da versão e do tipo de erro — pode vir como .status (number), como
  // .httpErrorCode (number), ou embutido na mensagem como string "404 Not Found".
  // Normalizar todas as formas antes de verificar.
  const err = error as Record<string, unknown> | null;
  const msg = typeof err?.message === "string" ? err.message : "";
  const status =
    (typeof err?.status === "number" ? err.status : null) ??
    (typeof err?.httpErrorCode === "number" ? err.httpErrorCode : null) ??
    (/503/.test(msg) ? 503 : null) ??
    (/429/.test(msg) ? 429 : null) ??
    (/404/.test(msg) ? 404 : null) ??
    (/400/.test(msg) ? 400 : null);

  if (status === 503) {
    return new Error(
      "O serviço de IA está sobrecarregado no momento. Tente novamente em alguns segundos."
    );
  }

  if (status === 429) {
    return new Error(
      "Limite de uso da IA atingido. Espere alguns segundos e tente novamente."
    );
  }

  if (status === 404) {
    return new Error(
      `O modelo de IA configurado (${GEMINI_MODEL}) não está disponível. Verifique lib/gemini.ts.`
    );
  }

  if (status === 400) {
    return new Error("A descrição enviada não pôde ser processada. Tente reformular ou encurtar o texto.");
  }

  return new Error("Não foi possível analisar a vaga. Tente novamente em instantes.");
}

// Valida que o output do Gemini tem o shape esperado antes de ser usado.
// Segunda linha de defesa contra prompt injection: mesmo que o modelo retorne
// dados manipulados (ex: campos com conteúdo arbitrário ou arrays gigantes),
// eles são rejeitados aqui. Os limites de tamanho também protegem contra
// o modelo gerar outputs anormalmente grandes que inflariam o banco.
function isValidAnalysis(data: unknown): data is JobAnalysis {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  if (typeof d.company !== "string" || d.company.length === 0 || d.company.length > 200) return false;
  if (typeof d.title !== "string" || d.title.length === 0 || d.title.length > 200) return false;
  if (typeof d.summary !== "string" || d.summary.length > 2000) return false;

  for (const field of ["requirements", "technologies", "questions", "checklist"] as const) {
    if (!Array.isArray(d[field])) return false;
  }

  const arr = d as { requirements: unknown[]; technologies: unknown[]; questions: unknown[]; checklist: unknown[] };
  if (arr.requirements.length > 20) return false;
  if (arr.technologies.length > 30) return false;
  if (arr.questions.length > 10) return false;
  if (arr.checklist.length > 10) return false;

  return true;
}

const LOCATIONS: readonly JobLocation[] = ["REMOTO", "HIBRIDO", "PRESENCIAL", "NAO_INFORMADO"];

// Campos novos (differentials, salary, location) são tolerantes: se o modelo
// omitir ou mandar algo fora do formato, caem no valor neutro em vez de
// derrubar a análise inteira — são complementares, não o núcleo dela.
function normalizeExtras(d: JobAnalysis): JobAnalysis {
  const raw = d as unknown as Record<string, unknown>;

  const differentials = Array.isArray(raw.differentials)
    ? raw.differentials.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 15)
    : [];

  const salaryText = typeof raw.salary === "string" ? raw.salary.trim() : "";
  // Precisa de ao menos um dígito: descarta "a combinar", "compatível com o mercado" etc.
  const salary = salaryText && /\d/.test(salaryText) ? salaryText.slice(0, 100) : null;

  const location = LOCATIONS.includes(raw.location as JobLocation)
    ? (raw.location as JobLocation)
    : "NAO_INFORMADO";

  return { ...d, differentials, salary, location };
}

// Espera N ms antes de continuar — usado entre tentativas de retry
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tenta chamar o Gemini até 3 vezes com backoff exponencial antes de desistir.
// 503 é temporário (servidor sobrecarregado) — retry resolve na maioria dos casos.
async function callGeminiWithRetry(
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
  prompt: string,
  maxAttempts = 3
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(prompt);

      const candidate = result.response.candidates?.[0];
      if (!candidate) throw new Error("A IA não retornou nenhuma resposta.");

      const parts: Part[] = candidate.content?.parts ?? [];
      const textParts = parts
        .filter((p) => "text" in p && !("thought" in p && p.thought))
        .map((p) => ("text" in p ? (p as { text: string }).text : ""));

      const text = textParts.length > 0 ? textParts.join("") : result.response.text();

      if (!text || text.trim() === "") throw new Error("A IA retornou uma resposta vazia.");

      return text;
    } catch (error) {
      lastError = error;
      const msg = (error as Error)?.message ?? "";
      const is503 = /503/.test(msg);

      console.error(`Gemini tentativa ${attempt}/${maxAttempts}:`, msg.slice(0, 120));

      // Só faz retry em 503 — outros erros falham imediatamente
      if (!is503 || attempt === maxAttempts) break;

      // Backoff: 2s na primeira, 4s na segunda
      await sleep(attempt * 2000);
    }
  }

  throw lastError;
}

export async function analyzeJobWithGemini(jobText: string): Promise<JobAnalysis> {
  // Modelos com thinking:true (todos os disponíveis nesta chave) encapsulam
  // a resposta de forma diferente. Desabilitar thinking garante resposta
  // direta em texto simples, compatível com o JSON que esperamos.
  const model = getClient().getGenerativeModel({ model: GEMINI_MODEL });

  let rawText: string;
  try {
    rawText = await callGeminiWithRetry(model, PROMPT_TEMPLATE(jobText));
  } catch (error) {
    console.error("Erro na chamada à API do Gemini:", (error as Error)?.message);
    throw toFriendlyError(error);
  }

  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("JSON inválido recebido do Gemini:", cleaned.slice(0, 300));
    throw new Error("A IA retornou um formato inválido. Tente novamente.");
  }

  // Valida o shape antes de retornar — rejeita outputs fora do esperado
  if (!isValidAnalysis(parsed)) {
    console.error("Output do Gemini fora do schema esperado:", cleaned.slice(0, 500));
    throw new Error("A IA retornou um formato inesperado. Tente novamente.");
  }

  return normalizeExtras(parsed);
}
