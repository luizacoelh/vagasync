"use client";

import { useFormStatus } from "react-dom";
import { signInWith } from "@/app/actions/auth";

// Botões de login (Google e GitHub) + aviso de termos. Usados na tela /login
// e na janela de login que abre por cima da página no modo visitante
// (components/auth/LoginGate.tsx). `redirectTo` é para onde voltar depois.
export default function LoginButtons({ redirectTo }: { redirectTo: string }) {
  return (
    <>
      <form action={signInWith.bind(null, "google", redirectTo)}>
        <ProviderButton icon={<GoogleIcon />} label="Entrar com Google" />
      </form>
      <form action={signInWith.bind(null, "github", redirectTo)} className="mt-3">
        <ProviderButton icon={<GitHubIcon />} label="Entrar com GitHub" />
      </form>

      <div className="my-[22px] flex items-center gap-[10px]">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-[11px] tracking-wide text-[#6B7484]" style={{ fontFamily: "var(--font-outfit)" }}>
          SEGURO E CRIPTOGRAFADO
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <p className="text-center text-xs leading-relaxed text-[#6B7484]">
        Ao entrar, você concorda com a{" "}
        <a href="/privacidade" className="text-[#85B7EB] hover:underline">
          Política de Privacidade
        </a>{" "}
        e os{" "}
        <a href="/termos" className="text-[#85B7EB] hover:underline">
          Termos de Uso
        </a>
        .
      </p>
    </>
  );
}

function ProviderButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="glass-btn flex w-full items-center justify-center gap-3 rounded-2xl py-3 text-sm font-medium text-[#F2F4F7] disabled:opacity-60"
      style={{ fontFamily: "var(--font-outfit)" }}
    >
      {icon}
      {pending ? "Abrindo..." : label}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.38-1.34-1.75-1.34-1.75-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.02 2.89-.02 3.29 0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
