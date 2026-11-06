import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DELETED_ACCOUNT_NAME } from "@/lib/deletedAccount";

export { DELETED_ACCOUNT_NAME, isDeletedAccount } from "@/lib/deletedAccount";
export const DELETE_CONFIRMATION = "EXCLUIR";

export type DeleteAccountResult = "ok" | "owner" | "not_found";

// Os limites por IP (lib/ipRateLimit.ts e lib/jobImport/quota.ts) contam a
// última hora: o IP dessas linhas fica, senão excluir a conta liberaria o IP.
// Cada exclusão limpa o IP com mais de 1h de todas as contas excluídas.
const IP_WINDOW_MS = 3600000;

// "Excluir minha conta" em /perfil. Apaga os dados pessoais (vagas, perfil,
// vínculos de login, nome, e-mail e foto) e mantém a linha de User anônima com
// os registros de uso (sem IP, salvo o da última hora). Apagar a linha de vez, em cascata, levaria junto
// User.createdAt, AiUsage e JobCreationQuota: os tetos de contas novas, de IA e
// de cadastro do site voltariam a ter espaço, e excluir e recriar contas
// burlaria os limites.
//
// Sem Account, o login com o mesmo Google/GitHub cria uma conta nova (e conta no
// teto de contas novas). O JWT não é revogado (auth.ts): quem guardou o cookie
// continua numa conta vazia, sem IA (limite 0, que lib/rateLimit.ts recusa) e
// com as cotas de cadastro que já tinha; o /admin não altera contas excluídas.
// O dono da instância nunca é excluído por aqui.
export async function deleteAccountData(
  userId: string,
  db: Pick<PrismaClient, "$transaction"> = prisma,
): Promise<DeleteAccountResult> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { isOwner: true } });
    if (!user) return "not_found";
    if (user.isOwner) return "owner";
    await tx.job.deleteMany({ where: { userId } });
    await tx.userProfile.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_ACCOUNT_NAME,
        email: null,
        emailVerified: null,
        image: null,
        isAdmin: false,
        dailyAiLimitOverride: 0,
        monitoredTrialUntil: null,
      },
    });
    await tx.aiUsage.updateMany({
      where: {
        ip: { not: null },
        createdAt: { lt: new Date(Date.now() - IP_WINDOW_MS) },
        user: { name: DELETED_ACCOUNT_NAME, email: null },
      },
      data: { ip: null },
    });
    return "ok";
  });
}
