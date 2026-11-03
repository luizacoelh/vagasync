import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { getAppSettings } from "@/lib/appSettings";
import { getClientIp } from "@/lib/ipRateLimit";
import { readJobJson, object } from "@/lib/jobInput";
import { JobInputError } from "@/lib/jobCreation";
import { importJobFromUrl, InvalidImportUrl, readImportUrl } from "@/lib/jobImport/importUrl";
import { reserveImport } from "@/lib/jobImport/quota";
import { IMPORT_QUOTA, type ImportResponse } from "@/lib/jobImport/types";
import { prisma } from "@/lib/prisma";

// Baixa a página da vaga para a confirmação "É esta vaga?". Não grava vaga e não
// chama a IA. Contrato em lib/jobImport/types.ts; proteção da rede em lib/safeFetch.ts.
// Node.js por causa de node:http, DNS e do driver do banco; 8 s de leitura e folga.
export const runtime = "nodejs";
export const maxDuration = 30;

const LIMIT_MESSAGE = `Limite de importações por link atingido (${IMPORT_QUOTA.perHour} por hora, ${IMPORT_QUOTA.perDay} por dia). Cole o texto da vaga ou tente mais tarde.`;

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let url: URL;
  try {
    url = readImportUrl(object(await readJobJson(req, 8192)).url);
  } catch (error) {
    if (error instanceof JobInputError || error instanceof InvalidImportUrl) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const settings = await getAppSettings();
    const result = await importJobFromUrl(url, {
      maxTextChars: settings.maxDescriptionLength,
      findJobByUrl: async (urls) =>
        (await prisma.job.findFirst({ where: { userId: user.id, url: { in: urls } }, select: { id: true } }))?.id ?? null,
      reserve: () => reserveImport(user.id, getClientIp(req)),
    });
    if (result.status === "limite") {
      return NextResponse.json({ error: LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": "3600" } });
    }
    return NextResponse.json(result satisfies ImportResponse);
  } catch (error) {
    // Sem o link no log: a query string pode ter dados de quem compartilhou.
    console.error("Erro ao importar vaga:", (error as Error)?.message);
    return NextResponse.json({ error: "Não foi possível buscar a vaga agora. Tente de novo ou cole o texto." }, { status: 500 });
  }
}
