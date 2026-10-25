// Compara o schema REAL do banco (Turso ou um export .db) com o que as
// migrations de prisma/migrations produzem do zero, e aponta divergências.
// Existe porque o banco de produção já divergiu das migrations (alterações
// feitas à mão e um script que reescreveu tabela) sem ninguém perceber.
//
// Só LÊ o banco — não altera nada. Contra o Turso usa EXCLUSIVAMENTE o token
// somente-leitura (TURSO_READONLY_AUTH_TOKEN); sem ele, não roda (não cai no
// token de escrita). Todo comando enviado ao banco é um SELECT — inclusive a
// introspecção, feita pelas funções pragma_*() em vez de PRAGMA, para não
// depender de como o servidor classifica PRAGMAs num token read-only.
//
// Uso:
//   npm run check:turso                         (TURSO_DATABASE_URL + TURSO_READONLY_AUTH_TOKEN do .env.turso)
//   npm run check:turso -- --file ./export.db   (confere um export baixado do Turso, sem credenciais)
//
// Severidade:
//   ERRO  — falta tabela, coluna ou índice ÚNICO (integridade/funcionamento em risco). Sai com código 1.
//   AVISO — sobra coluna/tabela, default/tipo diferente, falta FK ou índice comum (não quebra o app).
import { createClient } from "@libsql/client";
import { requireTursoReadOnly, TURSO_LABEL } from "./lib/turso-env.mjs";
import { readdirSync, readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "prisma", "migrations");

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const filePath = fileIdx >= 0 ? args[fileIdx + 1] : undefined;

// Mesma lógica de scripts/apply-turso-migrations.mjs (mantenha as duas iguais).
function splitStatements(sql) {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutLineComments.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
}

// Lê a estrutura de um banco: tabelas → colunas, índices (únicos e comuns) e FKs.
async function describe(client) {
  const tableNames = (
    await client.execute(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name`
    )
  ).rows.map((r) => String(r.name));

  const schema = {};
  for (const table of tableNames) {
    const columns = {};
    for (const r of (await client.execute({ sql: `SELECT * FROM pragma_table_info(?)`, args: [table] })).rows) {
      columns[String(r.name)] = {
        type: String(r.type).toUpperCase(),
        notnull: Number(r.notnull),
        dflt: r.dflt_value === null ? null : String(r.dflt_value),
        pk: Number(r.pk),
      };
    }

    // Índices: compara pelo conjunto de colunas + se é único (o nome pode variar:
    // UNIQUE embutido na tabela vira "sqlite_autoindex_..."). A PK é ignorada.
    const indexes = [];
    for (const idx of (await client.execute({ sql: `SELECT * FROM pragma_index_list(?)`, args: [table] })).rows) {
      if (String(idx.origin) === "pk") continue;
      const cols = (
        await client.execute({ sql: `SELECT * FROM pragma_index_info(?) ORDER BY seqno`, args: [String(idx.name)] })
      ).rows.map((r) => String(r.name));
      indexes.push({ unique: Number(idx.unique) === 1, cols: cols.join(", "), name: String(idx.name) });
    }

    const fkMap = new Map();
    for (const r of (await client.execute({ sql: `SELECT * FROM pragma_foreign_key_list(?)`, args: [table] })).rows) {
      const key = Number(r.id);
      const fk = fkMap.get(key) ?? { table: String(r.table), from: [], to: [], onDelete: String(r.on_delete) };
      fk.from.push(String(r.from));
      fk.to.push(String(r.to));
      fkMap.set(key, fk);
    }
    const fks = [...fkMap.values()].map((f) => `${f.from.join(", ")} → ${f.table}(${f.to.join(", ")}) ON DELETE ${f.onDelete}`);

    schema[table] = { columns, indexes, fks };
  }
  return schema;
}

async function buildReference() {
  const dir = mkdtempSync(join(tmpdir(), "vagasync-ref-"));
  const client = createClient({ url: `file:${join(dir, "ref.db")}` });
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const folder of folders) {
    const sqlPath = join(migrationsDir, folder, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    for (const statement of splitStatements(readFileSync(sqlPath, "utf-8"))) {
      await client.execute(statement);
    }
  }
  const schema = await describe(client);
  client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    
  }
  return schema;
}

function compare(reference, actual) {
  const findings = [];
  const add = (level, table, message) => findings.push({ level, table, message });

  for (const table of Object.keys(reference)) {
    if (!actual[table]) {
      add("ERRO", table, "a tabela não existe no banco");
      continue;
    }
    const ref = reference[table];
    const act = actual[table];

    for (const [name, rc] of Object.entries(ref.columns)) {
      const ac = act.columns[name];
      if (!ac) {
        add("ERRO", table, `falta a coluna "${name}"`);
        continue;
      }
      if (rc.pk !== ac.pk) add("ERRO", table, `chave primária diferente em "${name}"`);
      if (rc.type !== ac.type) add("AVISO", table, `coluna "${name}": tipo ${ac.type} no banco, ${rc.type} nas migrations`);
      if (rc.notnull !== ac.notnull) add("AVISO", table, `coluna "${name}": NOT NULL ${ac.notnull ? "sim" : "não"} no banco, ${rc.notnull ? "sim" : "não"} nas migrations`);
      if (rc.dflt !== ac.dflt) add("AVISO", table, `coluna "${name}": default ${ac.dflt ?? "(nenhum)"} no banco, ${rc.dflt ?? "(nenhum)"} nas migrations`);
    }
    for (const name of Object.keys(act.columns)) {
      if (!ref.columns[name]) add("AVISO", table, `coluna "${name}" existe no banco mas não nas migrations (o app não a conhece)`);
    }

    for (const ri of ref.indexes) {
      const found = act.indexes.some((ai) => ai.unique === ri.unique && ai.cols === ri.cols);
      if (!found) {
        add(ri.unique ? "ERRO" : "AVISO", table, `falta o índice ${ri.unique ? "ÚNICO" : "comum"} em (${ri.cols})`);
      }
    }
    for (const rf of ref.fks) {
      if (!act.fks.includes(rf)) add("AVISO", table, `falta a chave estrangeira: ${rf}`);
    }
  }
  for (const table of Object.keys(actual)) {
    if (!reference[table]) add("AVISO", table, "tabela existe no banco mas não nas migrations");
  }
  return findings;
}

async function main() {
  let client;
  let label;
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`Arquivo não encontrado: ${filePath}`);
      process.exit(1);
    }
    client = createClient({ url: `file:${resolve(filePath)}` });
    label = filePath;
  } else {
    const { url, authToken } = requireTursoReadOnly();
    client = createClient({ url, authToken });
    label = `${TURSO_LABEL}, token somente-leitura`;
  }

  console.log(`Conferindo ${label} contra prisma/migrations...\n`);
  const [reference, actual] = [await buildReference(), await describe(client)];
  client.close();

  const findings = compare(reference, actual);
  const errors = findings.filter((f) => f.level === "ERRO");
  const warnings = findings.filter((f) => f.level === "AVISO");

  for (const f of [...errors, ...warnings]) {
    console.log(`${f.level.padEnd(5)} [${f.table}] ${f.message}`);
  }
  if (findings.length === 0) console.log("Sem diferenças: o banco bate com as migrations.");
  console.log(`\n${errors.length} erro(s), ${warnings.length} aviso(s).`);
  process.exit(errors.length > 0 ? 1 : 0);
}

// Só a mensagem: o objeto de erro do libSQL traz o hostname do banco.
main().catch((error) => {
  console.error("Erro:", error?.message ?? String(error));
  process.exit(1);
});
