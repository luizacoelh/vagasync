// Stub de @/auth para os testes: a sessão é globalThis.__session.
export async function auth() {
  return globalThis.__session ?? null;
}

// Registra o logout em globalThis.__signOut, sem redirect.
export async function signOut(options) {
  globalThis.__signOut = options ?? {};
  globalThis.__session = null;
}
