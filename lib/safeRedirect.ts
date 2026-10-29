// Para onde voltar depois do login: só caminho interno ("/x"). "//host" e
// "/\host" o navegador trata como outro site, então viram "/".
export function safeRedirectPath(path: string | undefined | null): string {
  return typeof path === "string" && !/[\u0000-\u0020\u007f]/.test(path) && /^\/(?![/\\])/.test(path) ? path : "/";
}
