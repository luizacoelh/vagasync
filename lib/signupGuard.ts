import { getAppSettings } from "@/lib/appSettings";
import { prisma } from "@/lib/prisma";

// Contas novas por 24h no site inteiro, editável em /admin. Cada conta tem a
// própria cota de cadastro (lib/jobCreation.ts) e de IA; sem este teto, criar
// contas em série multiplicaria essas cotas. Quem já tem conta entra sempre.
// Sem trava: logins simultâneos podem passar alguns acima do teto, cada um com
// uma conta Google/GitHub real.

// Conta nova = nem o vínculo OAuth nem o e-mail existem (o e-mail liga as
// contas Google/GitHub da mesma pessoa: allowDangerousEmailAccountLinking).
export async function allowSignIn(email: string | null | undefined, provider: string, providerAccountId: string) {
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  });
  if (linked) return true;
  if (email && (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) return true;

  const { newAccountsPerDay } = await getAppSettings();
  const recent = await prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } });
  if (recent < newAccountsPerDay) return true;
  console.warn(`[auth] teto de ${newAccountsPerDay} contas novas em 24h atingido; cadastro recusado`);
  return false;
}

// Resposta do callback signIn do Auth.js. Erro próprio em vez de false:
// AccessDenied também é o que o Auth.js usa quando o callback falha (ex: banco
// fora do ar), e aí a mensagem certa é a genérica.
export async function checkSignIn(
  user: { email?: string | null },
  account: { provider: string; providerAccountId: string } | null | undefined,
): Promise<true | string> {
  if (!account) return true;
  return (await allowSignIn(user.email, account.provider, account.providerAccountId)) || "/login?error=CadastroLimitado";
}
