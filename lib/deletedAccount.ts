// Marca da conta excluída (lib/accountDeletion.ts), sem Prisma para poder ser
// usada também em componentes do cliente (components/admin/UsersTable.tsx).
export const DELETED_ACCOUNT_NAME = "Conta excluída";

export function isDeletedAccount(user: { name: string | null; email: string | null }): boolean {
  return user.name === DELETED_ACCOUNT_NAME && user.email === null;
}

// Filtro do Prisma para listar só contas ativas (o /admin esconde as excluídas).
// Sem NOT: no SQL, NOT(name = X AND email IS NULL) dá NULL para conta sem nome e
// a esconderia também.
export const ACTIVE_ACCOUNT_WHERE = {
  OR: [{ email: { not: null } }, { name: null }, { name: { not: DELETED_ACCOUNT_NAME } }],
};
export const DELETED_ACCOUNT_WHERE = { name: DELETED_ACCOUNT_NAME, email: null };
