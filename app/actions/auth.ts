"use server";

import { signIn } from "@/auth";
import { safeRedirectPath } from "@/lib/safeRedirect";

const PROVIDERS = ["google", "github"] as const;

// Login chamado pelos botões de components/auth/LoginButtons.tsx (tela /login
// e janela de login do modo visitante). Volta para a página onde a pessoa
// estava; o caminho vem do cliente, então passa por safeRedirectPath.
export async function signInWith(provider: string, redirectTo: string) {
  if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) {
    throw new Error("Provedor de login inválido.");
  }
  await signIn(provider, { redirectTo: safeRedirectPath(redirectTo) });
}
