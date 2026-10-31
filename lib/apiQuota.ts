import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Pedidos por minuto, por conta, nas rotas e actions sem cota própria. Fica
// bem acima do uso normal e barra só repetição automática. O cadastro e a IA
// têm cotas próprias (lib/jobCreation.ts, lib/rateLimit.ts).
export const API_LIMITS = {
  general: 120,
  export: 5,
} as const;

type ApiLimit = keyof typeof API_LIMITS;

export const API_LIMIT_MESSAGE = "Muitas ações em pouco tempo. Aguarde até um minuto e tente novamente.";

// Contado no banco porque funções serverless não compartilham memória. Usa a
// tabela de cotas, sem migration, com chaves próprias que não se misturam às de
// cadastro. Um único comando, atômico: pedidos simultâneos não passam do limite.
// O SELECT em "User" evita erro de chave estrangeira se a sessão ainda aponta
// para uma conta excluída; nesse caso nada é gravado e o pedido é recusado.
export async function allowApiRequest(userId: string, limit: ApiLimit = "general"): Promise<boolean> {
  const changed = await prisma.$executeRaw`INSERT INTO "JobCreationQuota" ("userId", channel, "minuteStart", "minuteCount", "dayStart", "dayCount")
    SELECT id, ${`api-${limit}`}, unixepoch(), 1, 0, 0 FROM "User" WHERE id = ${userId}
    ON CONFLICT ("userId", channel) DO UPDATE SET
      "minuteCount" = CASE WHEN "minuteStart" <= unixepoch() - 60 THEN 1 ELSE "minuteCount" + 1 END,
      "minuteStart" = CASE WHEN "minuteStart" <= unixepoch() - 60 THEN unixepoch() ELSE "minuteStart" END
    WHERE "minuteStart" <= unixepoch() - 60 OR "minuteCount" < ${API_LIMITS[limit]}`;
  return changed === 1;
}

// Uso nas rotas, depois de requireUser():
//   const limited = await limitApi(user.id);
//   if (limited) return limited;
export async function limitApi(userId: string, limit: ApiLimit = "general") {
  if (await allowApiRequest(userId, limit)) return null;
  return NextResponse.json({ error: API_LIMIT_MESSAGE }, { status: 429, headers: { "Retry-After": "60" } });
}
