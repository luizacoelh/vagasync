import { prisma } from "@/lib/prisma";

// Contas novas por 24h no site inteiro. Cada conta tem a própria cota de
// cadastro (lib/jobCreation.ts); sem este teto, criar contas em série
// multiplicaria essa cota. Quem já tem conta entra sempre.
export const NEW_ACCOUNTS_PER_DAY = 20;

// Conta nova = nem o vínculo OAuth nem o e-mail existem (o e-mail liga as
// contas Google/GitHub da mesma pessoa: allowDangerousEmailAccountLinking).
export async function allowSignIn(email: string | null | undefined, provider: string, providerAccountId: string) {
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  });
  if (linked) return true;
  if (email && (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) return true;

  const recent = await prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } });
  if (recent < NEW_ACCOUNTS_PER_DAY) return true;
  console.warn(`[auth] teto de ${NEW_ACCOUNTS_PER_DAY} contas novas em 24h atingido; cadastro recusado`);
  return false;
}
