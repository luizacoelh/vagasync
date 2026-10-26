import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import NewJobFab from "@/components/ui/NewJobFab";
import { LoginGateProvider } from "@/components/auth/LoginGate";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "VagaSync",
  description: "Organize suas candidaturas de emprego com ajuda de IA.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sem sessão = modo visitante: as páginas mostram vagas de exemplo e as
  // ações abrem a janela de login (components/auth/LoginGate.tsx).
  const session = await auth();

  return (
    <html lang="pt-BR" className={`${outfit.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/*
          Filtro de refração usado pelos painéis .glass-surface do app
          (ver app/globals.css). Definido uma única vez aqui — qualquer
          .glass-surface em qualquer página referencia url(#glass-distort)
          no backdrop-filter. Fica invisível (0x0) e não afeta layout.
          Chips, inputs e botões NÃO usam este filtro (só blur+saturate) —
          ver comentário de performance em globals.css.
        */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id="glass-distort" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>

        <LoginGateProvider isGuest={!session?.user}>
          {children}

          {/*
            FAB global de "Nova vaga" — aparece em todas as páginas, inclusive
            no modo visitante (some só em login, perfil, termos e admin). Fixo
            no canto inferior direito em mobile (círculo 56px), expande pra
            texto em sm+. Em desktop convive com o "+ Nova vaga" do header.
          */}
          <NewJobFab />
        </LoginGateProvider>
      </body>
    </html>
  );
}
