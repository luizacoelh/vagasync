// Stub de @/auth para os testes: a sessão é globalThis.__session.
export async function auth() {
  return globalThis.__session ?? null;
}
