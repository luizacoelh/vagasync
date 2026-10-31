// Sites que não permitem leitura automática: o servidor não baixa nada deles e a
// extensão só envia o texto selecionado. Conferir o link inicial e cada
// redirecionamento, porque um link curto pode levar a um destes domínios.
export const BLOCKED_IMPORT_DOMAINS = [
  "linkedin.com",
  "lnkd.in",
  "indeed.com",
  "indeed.com.br",
  "glassdoor.com",
  "glassdoor.com.br",
  "catho.com",
  "catho.com.br",
] as const;

// Recebe o hostname de new URL(...), que já vem em minúsculas e em punycode.
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  return BLOCKED_IMPORT_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
