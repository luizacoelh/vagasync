// Marca um usuário como admin (User.isAdmin = true), buscando pelo e-mail.
// Com --owner, marca também como DONO da instância (User.isOwner = true):
// o dono não pode ter o admin alterado pela interface (/admin) por ninguém,
// só por este script ou direto no banco.
//
// Necessário rodar uma vez pra ativar o primeiro admin/dono — depois disso,
// o próprio painel /admin permite promover outras contas (nunca o dono).
//
// Por padrão escreve no SQLite LOCAL (DATABASE_URL do .env), mesmo que haja
// variáveis do Turso no ambiente. Produção só com --turso, que exige o
// .env.turso com DATABASE_TARGET=turso (ver scripts/lib/turso-env.mjs).
//
// Uso:
//   node scripts/set-admin.mjs seu-email@gmail.com                    (admin, local)
//   node scripts/set-admin.mjs seu-email@gmail.com --owner            (dono + admin, local)
//   node scripts/set-admin.mjs seu-email@gmail.com --owner --turso    (produção)
import "dotenv/config";
import { requireTursoWrite, TURSO_LABEL } from "./lib/turso-env.mjs";

const args = process.argv.slice(2);
const asOwner = args.includes("--owner");
const useTurso = args.includes("--turso");
const email = args.find((arg) => !arg.startsWith("--"));

if (!email) {
  console.error("Uso: node scripts/set-admin.mjs seu-email@exemplo.com [--owner]");
  process.exit(1);
}

const sql = asOwner
  ? `UPDATE "User" SET "isAdmin" = 1, "isOwner" = 1 WHERE "email" = ?`
  : `UPDATE "User" SET "isAdmin" = 1 WHERE "email" = ?`;
const role = asOwner ? "dono (e admin)" : "admin";

async function main() {
  if (useTurso) {
    const { url, authToken } = requireTursoWrite();
    console.log(`Destino: ${TURSO_LABEL}`);
    const { createClient } = await import("@libsql/client");
    const client = createClient({ url, authToken });

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
  const localUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  if (!localUrl.startsWith("file:")) {
    console.error('DATABASE_URL precisa ser um SQLite local ("file:..."). Para produção, use --turso.');
    process.exit(1);
  }
  console.log(`Destino: SQLite local (${localUrl})`);
  // fileMustExist: um caminho errado falha em vez de criar um banco vazio.
  const db = new Database(localUrl.replace(/^file:/, ""), { fileMustExist: true });

  const result = db.prepare(sql).run(email);

  if (result.changes === 0) {
    console.error(`Nenhum usuário encontrado com o e-mail ${email} no banco local.`);
    process.exit(1);
  }

  console.log(`Pronto — ${email} agora é ${role} (SQLite local).`);
  db.close();
}

main().catch((err) => {
  console.error("Erro:", err?.message ?? String(err)); // sem o objeto: ele traz o hostname do banco
  process.exit(1);
});
