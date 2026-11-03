// Marca da conta excluída (lib/accountDeletion.ts), sem Prisma para poder ser
// usada também em componentes do cliente (components/admin/UsersTable.tsx).
export const DELETED_ACCOUNT_NAME = "Conta excluída";

export function isDeletedAccount(user: { name: string | null; email: string | null }): boolean {
  return user.name === DELETED_ACCOUNT_NAME && user.email === null;
}
