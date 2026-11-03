import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/appSettings";

// Limite de chamadas ao Gemini por usuário, para evitar abuso. Contado no
// banco (não em memória) porque funções serverless não compartilham memória
// entre instâncias — um contador em memória seria inútil em produção na
// Vercel. O limite em si vem de AppSettings (editável em /admin sem deploy),
// com possibilidade de override por usuário em User.dailyAiLimitOverride.
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

// IMPORTANTE — decisão de implementação (corrige um bug real de condição de
// corrida que existia na primeira versão desta função):
//
// A versão antiga fazia um findUnique() seguido de um update() como duas
// operações separadas. Se duas requisições chegassem quase juntas (duplo
// clique, retry automático, etc.), as duas podiam ler o mesmo contador antes
// de qualquer uma escrever — permitindo passar do limite por 1-2 chamadas.
// Pouco grave em baixo volume, mas piora exatamente conforme o uso cresce.
//
// A versão abaixo usa updateMany() com a condição de limite DENTRO do WHERE
// da própria query SQL — o banco só incrementa se, no momento exato da
// escrita, a linha ainda satisfizer "dentro da janela E abaixo do limite".
// Isso é atômico: não existe uma janela de tempo entre ler e escrever onde
// duas requisições possam "ver" o mesmo valor desatualizado.
//
// Único caso remanescente (aceitável, documentado): se duas requisições
// chegarem exatamente no instante em que a janela de 24h expira, as duas
// podem cair no branch de "resetar contador" ao mesmo tempo e ambas serem
// permitidas (no pior caso, 1 chamada a mais que o limite, só nesse instante
// específico). Não vale a complexidade de uma transação serializável só para
// eliminar esse caso extremo.
export async function checkAndConsumeGeminiQuota(userId: string): Promise<RateLimitResult> {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { geminiCallResetAt: true, dailyAiLimitOverride: true },
    }),
    getAppSettings(),
  ]);

  if (!user) {
    // Não deveria acontecer (userId vem de uma sessão válida), mas por
    // segurança negamos em vez de deixar passar sem contabilizar.
    return { allowed: false, remaining: 0, limit: settings.dailyAiLimit };
  }

  const limit = user.dailyAiLimitOverride ?? settings.dailyAiLimit;
  // Limite 0 (conta excluída, lib/accountDeletion.ts) nunca libera: sem isto a
  // tentativa 2 resetaria a janela e daria uma chamada por dia.
  if (limit <= 0) return { allowed: false, remaining: 0, limit };
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  // Tentativa 1: incrementa atomicamente SE ainda estiver dentro da janela
  // atual E abaixo do limite. Isso cobre o caso comum (usuário já tem
  // contador ativo, ainda não estourou).
  const incremented = await prisma.user.updateMany({
    where: {
      id: userId,
      geminiCallResetAt: { gt: windowStart },
      geminiCallCount: { lt: limit },
    },
    data: { geminiCallCount: { increment: 1 } },
  });

  if (incremented.count === 1) {
    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: { geminiCallCount: true },
    });
    return {
      allowed: true,
      remaining: Math.max(0, limit - (updated?.geminiCallCount ?? limit)),
      limit,
    };
  }

  // Tentativa 1 não bateu — ou a janela expirou, ou o limite foi atingido.
  // Tentativa 2: reseta atomicamente SE a janela realmente tiver expirado.
  const reset = await prisma.user.updateMany({
    where: { id: userId, geminiCallResetAt: { lte: windowStart } },
    data: { geminiCallCount: 1, geminiCallResetAt: now },
  });

  if (reset.count === 1) {
    return { allowed: true, remaining: limit - 1, limit };
  }

  // Nem incrementou nem resetou: janela ainda ativa e limite já atingido.
  return { allowed: false, remaining: 0, limit };
}
