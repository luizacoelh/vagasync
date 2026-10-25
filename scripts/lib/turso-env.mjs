// Credenciais do Turso (produção) para os scripts — nunca para o app local.
//
// Elas ficam em .env.turso (ignorado pelo Git), um arquivo que o Next.js NÃO
// carrega: assim `npm run dev/build/start` não têm como alcançar produção.
// Só os scripts que importam este módulo leem esse arquivo, e nunca o .env.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.turso");

// Variáveis já definidas no processo têm prioridade sobre o arquivo.
export function loadTursoEnv() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Para scripts que ESCREVEM em produção. Exige a escolha explícita
// DATABASE_TARGET=turso além da URL e do token de escrita.
export function requireTursoWrite() {
  loadTursoEnv();
  const { DATABASE_TARGET, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (DATABASE_TARGET !== "turso") {
    fail("Escrita no Turso exige DATABASE_TARGET=turso no .env.turso (ou no ambiente). Nada foi feito.");
  }
  if (!url || !authToken) {
    fail("TURSO_DATABASE_URL e/ou TURSO_AUTH_TOKEN ausentes no .env.turso. Nada foi feito.");
  }
  return { url, authToken };
}

// Para scripts que só LEEM. Usa exclusivamente o token somente-leitura — de
// propósito, sem cair no token de escrita se este faltar.
export function requireTursoReadOnly() {
  loadTursoEnv();
  const { TURSO_DATABASE_URL: url, TURSO_READONLY_AUTH_TOKEN: authToken } = process.env;
  if (!url || !authToken) {
    fail("TURSO_DATABASE_URL e/ou TURSO_READONLY_AUTH_TOKEN ausentes no .env.turso. Nada foi feito.");
  }
  return { url, authToken };
}

// Identifica o banco nos logs sem expor o hostname.
export const TURSO_LABEL = "Turso (produção)";
