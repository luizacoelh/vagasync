import { readJobJson } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { findDuplicate, normalizeUrl, type ExistingJob } from "@/lib/jobDedup";
import { authorizeN8n, loadDedupJobs, optionalText } from "@/lib/n8nWebhook";

export const runtime = "nodejs";

// Checagem em lote, antes de o n8n enviar as vagas uma a uma: recebe
// { vagas: [{ url, title, company }] } e devolve os índices das que ainda não
// existem para o usuário. Assim o teto de envios por rodada ("Separar novas"
// no workflow) conta só vagas novas, e duplicadas antigas não ocupam a fila
// para sempre. Não grava nada nem chama a IA.
const MAX_ITEMS = 300;

export async function POST(req: NextRequest) {
  const auth = await authorizeN8n(req);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJobJson(req, 1048576);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const vagas = (body as { vagas?: unknown })?.vagas;
  if (!Array.isArray(vagas) || vagas.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Campo 'vagas' deve ser uma lista com até ${MAX_ITEMS} itens.` },
      { status: 400 }
    );
  }

  const candidates = vagas.map((item) => {
    const v = (item ?? {}) as Record<string, unknown>;
    return {
      url: normalizeUrl(optionalText(v.url, 2000)),
      title: optionalText(v.title),
      company: optionalText(v.company),
    };
  });

  const urls = candidates.map((c) => c.url).filter((url): url is string => url !== null);
  const existing: ExistingJob[] = await loadDedupJobs(auth.userId, urls);

  // Cada nova entra na lista comparada: a mesma vaga vinda de duas fontes
  // na mesma rodada conta uma vez só.
  const novas: number[] = [];
  const now = new Date();
  candidates.forEach((candidate, index) => {
    if (findDuplicate(candidate, existing)) return;
    novas.push(index);
    existing.push({
      id: `lote-${index}`,
      url: candidate.url,
      title: candidate.title ?? "",
      company: candidate.company ?? "",
      createdAt: now,
    });
  });

  return NextResponse.json({ novas, duplicadas: candidates.length - novas.length });
}
