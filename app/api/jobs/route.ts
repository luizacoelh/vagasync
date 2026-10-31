import { createLimitedJob, JobInputError, JobQuotaError } from "@/lib/jobCreation";
import { jobCreateData, readJobJson } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { requireUser } from "@/lib/apiAuth";
import { limitApi } from "@/lib/apiQuota";

export const runtime = "nodejs";

const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_TIME = Date.UTC(9999, 11, 31);

// Cursor = data de criação + id da última vaga da página. Não depende de a vaga
// ainda existir nem consulta a vaga de outra pessoa.
function parseCursor(value: string) {
  const match = /^(\d{1,16})_([\w-]{1,64})$/.exec(value);
  if (!match) return null;
  const time = Number(match[1]);
  return time > MAX_CURSOR_TIME ? null : { createdAt: new Date(time), id: match[2] };
}

// Devolve uma página por vez. O corpo continua sendo a lista de vagas; se houver
// mais, o cabeçalho X-Next-Cursor traz o valor para ?cursor= do próximo pedido.
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = await limitApi(user.id);
  if (limited) return limited;

  const params = req.nextUrl.searchParams;
  const take = params.has("limit") ? Number(params.get("limit")) : MAX_PAGE_SIZE;
  if (!Number.isInteger(take) || take < 1 || take > MAX_PAGE_SIZE) {
    return NextResponse.json({ error: `O limite precisa ser um inteiro de 1 a ${MAX_PAGE_SIZE}.` }, { status: 400 });
  }
  const rawCursor = params.get("cursor");
  const cursor = rawCursor === null ? null : parseCursor(rawCursor);
  if (rawCursor !== null && !cursor) {
    return NextResponse.json({ error: "Cursor inválido." }, { status: 400 });
  }

  const jobs = await prisma.job.findMany({
    where: {
      userId: user.id,
      // DESCARTADA só existe para a deduplicação do webhook; não é vaga do usuário.
      status: { not: "DESCARTADA" },
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const page = jobs.slice(0, take);
  const last = page.at(-1);
  const headers = jobs.length > take && last
    ? { "X-Next-Cursor": `${last.createdAt.getTime()}_${last.id}` }
    : undefined;
  return NextResponse.json(page.map(mapJob), { headers });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;
  try {
    const data = jobCreateData(await readJobJson(req), user.id);
    const job = await createLimitedJob(data, "manual");
    return NextResponse.json(mapJob(job), { status: 201 });
  } catch (error) {
    if (error instanceof JobInputError || error instanceof JobQuotaError) {
      return NextResponse.json({ error: error.message }, {
        status: error.status,
        headers: error instanceof JobQuotaError && error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
      });
    }
    console.error("Erro ao salvar vaga:", error);
    return NextResponse.json({ error: "Não foi possível salvar a vaga." }, { status: 500 });
  }
}
