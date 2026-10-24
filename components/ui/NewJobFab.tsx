import Link from "next/link";
import { auth } from "@/auth";
import { headers } from "next/headers";

export default async function NewJobFab() {
  const session = await auth();
  if (!session?.user) return null;

  // Lê o pathname injetado pelo proxy.ts. O try/catch garante que uma falha
  // na leitura do header (ex: em testes ou builds estáticos) não quebre o
  // render da página — o FAB simplesmente aparece em caso de dúvida.
  let pathname = "";
  try {
    const headersList = await headers();
    pathname = headersList.get("x-pathname") ?? "";
  } catch {
    pathname = "";
  }

  // Oculta onde não faz sentido contextualmente
  const hiddenPaths = ["/nova-vaga", "/login", "/perfil", "/termos", "/privacidade"];
  if (hiddenPaths.includes(pathname) || pathname.startsWith("/admin")) return null;

  return (
    <Link
      href="/nova-vaga"
      aria-label="Nova vaga"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-[#08131F] shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0 sm:h-auto sm:w-auto sm:rounded-2xl sm:px-5 sm:py-3"
      style={{
        background: "linear-gradient(155deg, #85B7EB, #378ADD)",
        boxShadow:
          "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 24px -6px rgba(55,138,221,0.65), 0 2px 8px rgba(0,0,0,0.4)",
        fontFamily: "var(--font-outfit)",
      }}
    >
      <span className="text-xl font-semibold leading-none sm:hidden">+</span>
      <span className="hidden text-sm font-semibold sm:inline">+ Nova vaga</span>
    </Link>
  );
}
