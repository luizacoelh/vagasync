// Marca um usuário como admin (User.isAdmin = true), buscando pelo e-mail.
// Com --owner, marca também como DONO da instância (User.isOwner = true):
// o dono não pode ter o admin alterado pela interface (/admin) por ninguém,
// só por este script ou direto no banco.
//
// Necessário rodar uma vez pra ativar o primeiro admin/dono — depois disso,
// o próprio painel /admin permite promover outras contas (nunca o dono).
//
// Funciona tanto contra o SQLite local quanto contra o Turso, escolhendo o
// driver do mesmo jeito que lib/prisma.ts (se TURSO_DATABASE_URL estiver no
// .env, usa Turso; senão, usa o SQLite local). Se algum dia lib/prisma.ts
// mudar essa lógica de seleção, atualize aqui também.
//
// Uso:
//   node scripts/set-admin.mjs seu-email@gmail.com            (admin)
//   node scripts/set-admin.mjs seu-email@gmail.com --owner    (dono + admin)
import "dotenv/config";

const args = process.argv.slice(2);
const asOwner = args.includes("--owner");
const email = args.find((arg) => !arg.startsWith("--"));

if (!email) {
  console.error("Uso: node scripts/set-admin.mjs seu-email@exemplo.com [--owner]");
  process.exit(1);
}

const sql = asOwner
  ? `UPDATE "User" SET "isAdmin" = 1, "isOwner" = 1 WHERE "email" = ?`
  : `UPDATE "User" SET "isAdmin" = 1 WHERE "email" = ?`;
const role = asOwner ? "dono (e admin)" : "admin";

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

async function main() {
  if (tursoUrl && tursoToken) {
    const { createClient } = await import("@libsql/client");
    const client = createClient({ url: tursoUrl, authToken: tursoToken });

    const result = await client.execute({ sql, args: [email] });

    if (result.rowsAffected === 0) {
      console.error(`Nenhum usuário encontrado com o e-mail ${email} no Turso.`);
      process.exit(1);
    }

    console.log(`Pronto — ${email} agora é ${role} (Turso/produção).`);
    client.close();
    return;
  }

  const Database = (await import("better-sqlite3")).default;
  const dbPath = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
  const db = new Database(dbPath);

  const result = db.prepare(sql).run(email);

  if (result.changes === 0) {
    console.error(`Nenhum usuário encontrado com o e-mail ${email} no banco local.`);
    process.exit(1);
  }

  console.log(`Pronto — ${email} agora é ${role} (SQLite local).`);
  db.close();
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
