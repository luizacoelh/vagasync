"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN_PATHS = ["/nova-vaga", "/login", "/perfil", "/termos", "/privacidade"];

export default function NewJobFabClient() {
  const pathname = usePathname();
  if (HIDDEN_PATHS.includes(pathname) || pathname.startsWith("/admin")) return null;

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
