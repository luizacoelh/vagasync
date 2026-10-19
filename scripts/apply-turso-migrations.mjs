// Aplica as migrations do Prisma (prisma/migrations/*/migration.sql) direto
// no banco do Turso, usando o mesmo pacote @libsql/client que a aplicação já
// usa em produção — sem precisar instalar a CLI do Turso (que no Windows
// exige WSL).
//
// IMPORTANTE — este script REGISTRA o que já aplicou (tabela _turso_migrations)
// e só executa migrations pendentes. A versão anterior reexecutava TODAS as
// migrations a cada rodada; as que recriam tabelas (CREATE new_X → INSERT…SELECT
// → DROP → RENAME) não dão erro numa segunda execução: elas reescrevem a tabela
// no formato antigo e apagam colunas e dados (ex.: Job.userId, url, salary).
//
// Uso:
//   node scripts/apply-turso-migrations.mjs --dry-run
//       só mostra o que seria aplicado, sem alterar nada
//   node scripts/apply-turso-migrations.mjs
//       aplica as migrations pendentes
//   node scripts/apply-turso-migrations.mjs --baseline <pasta-da-migration>
//       para um banco que JÁ EXISTIA (criado pela versão antiga do script):
//       marca como aplicadas todas as migrations até <pasta> (inclusive), sem
//       executar nada, e depois aplica só as posteriores
//   node scripts/apply-turso-migrations.mjs --allow-redefine
//       permite rodar migrations que recriam tabelas (têm DROP TABLE). Só use
//       em banco vazio/novo ou depois de confirmar que há backup/PITR.
//
// Lê TURSO_DATABASE_URL e TURSO_AUTH_TOKEN do .env.
import "dotenv/config";
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "prisma", "migrations");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allowRedefine = args.includes("--allow-redefine");
const baselineIdx = args.indexOf("--baseline");
const baseline = baselineIdx >= 0 ? args[baselineIdx + 1] : undefined;

if (baselineIdx >= 0 && (!baseline || baseline.startsWith("--"))) {
  console.error("--baseline precisa do nome da pasta da última migration já aplicada.");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error(
    "TURSO_DATABASE_URL e/ou TURSO_AUTH_TOKEN não encontradas no .env. Preencha as duas antes de rodar este script."
  );
  process.exit(1);
}

// Remove comentários de linha (-- ...) e de bloco (/* ... */), depois separa
// em statements individuais por ";". Seguro aqui porque as migrations deste
// projeto são só DDL (CREATE/ALTER/DROP/INSERT...SELECT simples) — nenhum
// valor de string contém ";" no meio.
function splitStatements(sql) {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutLineComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const client = createClient({ url, authToken });

  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(); // nomes de pasta começam com timestamp, ordem alfabética = ordem cronológica

  if (folders.length === 0) {
    console.log("Nenhuma migration encontrada em prisma/migrations.");
    return;
  }

  if (baseline && !folders.includes(baseline)) {
    console.error(`--baseline: pasta "${baseline}" não existe em prisma/migrations.`);
    process.exit(1);
  }

  const tables = (
    await client.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`)
  ).rows.map((row) => String(row.name));
  const hasTracking = tables.includes("_turso_migrations");
  const hasAppTables = tables.includes("User") || tables.includes("Job");

  // Banco que já tem tabelas mas nunca foi registrado por este script: não dá
  // para saber o que já foi aplicado. Reexecutar tudo é exatamente o que
  // causou perda de dados, então exige o --baseline explícito.
  if (!hasTracking && hasAppTables && !baseline) {
    console.error(
      [
        "Este banco já tem tabelas (User/Job), mas nunca foi registrado por este script.",
        "Rodar tudo de novo reescreveria tabelas e apagaria dados.",
        "",
        "Informe até qual migration o banco já está atualizado, por exemplo:",
        `  node scripts/apply-turso-migrations.mjs --baseline ${folders[folders.length - 2] ?? folders[0]}`,
        "(use a pasta da ÚLTIMA migration que já foi aplicada nele; as seguintes serão aplicadas).",
        "Use --dry-run antes para ver o que seria feito.",
      ].join("\n")
    );
    process.exit(1);
  }

  const applied = new Set();
  if (hasTracking) {
    const rows = (await client.execute(`SELECT name FROM "_turso_migrations"`)).rows;
    for (const row of rows) applied.add(String(row.name));
  }

  if (baseline) {
    for (const folder of folders) {
      if (folder <= baseline) applied.add(folder);
    }
  }

  const pending = folders.filter((folder) => !applied.has(folder));
  const baselineOnly = baseline ? folders.filter((f) => f <= baseline && !hasTracking) : [];

  if (baselineOnly.length > 0) {
    console.log(`Baseline: ${baselineOnly.length} migration(s) serão marcadas como já aplicadas (sem executar):`);
    for (const folder of baselineOnly) console.log(`  · ${folder}`);
    console.log("");
  }

  if (pending.length === 0) {
    console.log("Nada pendente — o banco já está atualizado.");
    if (!dryRun && baselineOnly.length > 0) await recordBaseline(client, baselineOnly);
    client.close();
    return;
  }

  console.log(`Pendentes (${pending.length}):`);
  for (const folder of pending) console.log(`  → ${folder}`);
  console.log("");

  // Migrations que recriam tabelas são perigosas fora de um banco vazio.
  const redefining = pending.filter((folder) => {
    const sqlPath = join(migrationsDir, folder, "migration.sql");
    if (!existsSync(sqlPath)) return false;
    const statements = splitStatements(readFileSync(sqlPath, "utf-8"));
    return statements.some((s) => /^\s*DROP\s+TABLE/i.test(s));
  });

  if (redefining.length > 0 && !allowRedefine) {
    console.error(
      [
        "Estas migrations pendentes recriam tabelas (DROP TABLE) e podem apagar dados:",
        ...redefining.map((f) => `  · ${f}`),
        "",
        "Em um banco novo/vazio, rode com --allow-redefine.",
        "Em um banco com dados, faça backup (ou confirme o PITR do Turso) antes e revise o SQL.",
      ].join("\n")
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log("--dry-run: nada foi alterado.");
    client.close();
    return;
  }

  await client.execute(
    `CREATE TABLE IF NOT EXISTS "_turso_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  );
  if (baselineOnly.length > 0) await recordBaseline(client, baselineOnly);

  for (const folder of pending) {
    const sqlPath = join(migrationsDir, folder, "migration.sql");
    let sql;
    try {
      sql = readFileSync(sqlPath, "utf-8");
    } catch {
      console.log(`  (pulado — sem migration.sql em ${folder})`);
      continue;
    }

    const statements = splitStatements(sql);
    console.log(`→ aplicando ${folder} (${statements.length} statement(s))`);
    const isRedefine = redefining.includes(folder);

    for (const statement of statements) {
      try {
        await client.execute(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Em migrations simples (sem DROP TABLE), "already exists"/"duplicate
        // column" significam que o statement já tinha sido aplicado à mão ou
        // numa tentativa interrompida — seguro continuar. Em migrations que
        // recriam tabelas isso NUNCA é ignorado.
        if (!isRedefine && /already exists|duplicate column/i.test(message)) {
          console.log(`   (já aplicado, ignorando: ${message})`);
          continue;
        }
        console.error(`   ERRO no statement:\n   ${statement}\n   → ${message}`);
        console.error(`\nA migration ${folder} NÃO foi registrada como aplicada. Corrija e rode de novo.`);
        process.exit(1);
      }
    }

    await client.execute({ sql: `INSERT OR IGNORE INTO "_turso_migrations" ("name") VALUES (?)`, args: [folder] });
  }

  console.log("\nMigrations aplicadas com sucesso no Turso.");
  client.close();
}

async function recordBaseline(client, folders) {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS "_turso_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  );
  for (const folder of folders) {
    await client.execute({ sql: `INSERT OR IGNORE INTO "_turso_migrations" ("name") VALUES (?)`, args: [folder] });
  }
}

main().catch((error) => {
  console.error("Erro:", error);
  process.exit(1);
});
