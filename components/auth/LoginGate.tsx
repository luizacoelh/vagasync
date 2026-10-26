"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import GlassPanel from "@/components/ui/Glass";
import LoginButtons from "@/components/auth/LoginButtons";

// Modo visitante: sem login dá para navegar pelo app com vagas de exemplo
// (lib/demoJobs.ts), mas qualquer ação que grava algo abre esta janela de
// login por cima da página. Os componentes chamam requireLogin() no começo do
// handler e param se ela devolver true. A proteção de verdade continua no
// servidor (Server Actions e rotas de API recusam quem não está logado);
// isto é só para o visitante ver um convite em vez de um erro.

type Gate = {
  isGuest: boolean;
  // Abre a janela se for visitante. `message` explica o que o login libera.
  requireLogin: (message?: string) => boolean;
};

const LoginGateContext = createContext<Gate>({ isGuest: false, requireLogin: () => false });

export function useLoginGate(): Gate {
  return useContext(LoginGateContext);
}

const DEFAULT_MESSAGE = "Entre para salvar suas vagas e acompanhar suas candidaturas.";

export function LoginGateProvider({ isGuest, children }: { isGuest: boolean; children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const requireLogin = useCallback(
    (text?: string) => {
      if (!isGuest) return false;
      setMessage(text ?? DEFAULT_MESSAGE);
      return true;
    },
    [isGuest]
  );

  const value = useMemo(() => ({ isGuest, requireLogin }), [isGuest, requireLogin]);

  return (
    <LoginGateContext.Provider value={value}>
      {children}
      {message && <LoginDialog message={message} onClose={() => setMessage(null)} />}
    </LoginGateContext.Provider>
  );
}

function LoginDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // showModal() cuida do foco, do Esc e de deixar o resto da página inerte.
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clique fora do painel (no fundo escuro) fecha
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      aria-labelledby="login-dialog-title"
      className="m-auto w-full max-w-sm bg-transparent p-4 text-[#E4E6EB] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <GlassPanel radius={28} plateClassName="relative px-8 py-9">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-lg px-2 py-1 text-lg leading-none text-[#7C8494] hover:text-[#E4E6EB]"
        >
          ×
        </button>

        <h2
          id="login-dialog-title"
          className="mb-2 text-center text-[21px] font-semibold"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          Entre para continuar
        </h2>
        <p className="mb-7 text-center text-sm text-[#A9B2C0]">{message}</p>

        <LoginButtons redirectTo={pathname} />
      </GlassPanel>
    </dialog>
  );
}

// Botão que só abre a janela de login ("Entrar" do topo, "Começar agora" do
// convite do dashboard no modo visitante).
export function LoginButton({ label = "Entrar", primary = false }: { label?: string; primary?: boolean }) {
  const { requireLogin } = useLoginGate();
  return (
    <button
      type="button"
      onClick={() => requireLogin("Entre com sua conta Google ou GitHub. É grátis.")}
      className={`rounded-xl px-4 py-2 text-sm ${
        primary ? "font-semibold text-[#08131F]" : "glass-btn font-medium text-[#E4E6EB]"
      }`}
      style={{
        fontFamily: "var(--font-outfit)",
        ...(primary && {
          background: "linear-gradient(155deg, #85B7EB, #378ADD)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
        }),
      }}
    >
      {label}
    </button>
  );
}
