"use server";

import { auth, signOut } from "@/auth";
import { deleteAccountData, DELETE_CONFIRMATION } from "@/lib/accountDeletion";

// Chamada por components/profile/DeleteAccount.tsx. O usuário vem só da sessão;
// a confirmação digitada evita exclusão por clique acidental.
export async function deleteMyAccount(confirmation: unknown): Promise<{ error: string } | void> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Não autenticado." };
  if (confirmation !== DELETE_CONFIRMATION) return { error: `Digite ${DELETE_CONFIRMATION} para confirmar.` };

  let result;
  try {
    result = await deleteAccountData(session.user.id);
  } catch {
    return { error: "Não foi possível excluir a conta agora. Tente de novo." };
  }
  if (result === "owner") return { error: "A conta da dona da instância não pode ser excluída por aqui." };
  if (result === "not_found") return { error: "Conta não encontrada." };

  // Fora do try: signOut encerra com um redirect, que o Next trata como exceção.
  await signOut({ redirectTo: "/" });
}
