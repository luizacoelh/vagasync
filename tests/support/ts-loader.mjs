// Hooks de módulo para os testes importarem o código TypeScript do app
// (rotas, Server Actions, lib/) direto no node --test, sem o Next.
// - "@/..." resolve a partir da raiz do repositório, como no tsconfig.
// - .ts/.tsx são transpilados com o typescript já instalado (devDependency);
//   o transpileModule remove os imports só de tipo, o que o type stripping
//   do Node não faz.
// - Alguns módulos externos viram stubs (tests/support/stubs/): a IA não é
//   chamada, não há sessão do Auth.js nem cache do Next.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const STUBS = {
  "@google/generative-ai": "./stubs/generative-ai.mjs",
  "@/auth": "./stubs/auth.mjs",
  "next/cache": "./stubs/next-cache.mjs",
};
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function findSource(base) {
  for (const ext of EXTENSIONS) {
    const url = new URL(base.href + ext);
    if (existsSync(url)) return url.href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: new URL(STUBS[specifier], import.meta.url).href, shortCircuit: true };

  if (specifier.startsWith("@/")) {
    const url = findSource(new URL(specifier.slice(2), root));
    if (url) return { url, shortCircuit: true };
  }
  // import relativo sem extensão dentro de um .ts
  if (specifier.startsWith(".") && context.parentURL?.match(/\.tsx?$/) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const url = findSource(new URL(specifier, context.parentURL));
    if (url) return { url, shortCircuit: true };
  }

  try {
    return await next(specifier, context);
  } catch (error) {
    // pacote CommonJS sem "exports" ("next/server"): o ESM não completa a extensão
    if (error?.code === "ERR_MODULE_NOT_FOUND" && !specifier.startsWith(".") && !specifier.endsWith(".js")) {
      return next(`${specifier}.js`, context);
    }
    throw error;
  }
}

export async function load(url, context, next) {
  if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return next(url, context);
}
