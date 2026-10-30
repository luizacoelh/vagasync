import Link from "next/link";
import { redirect } from "next/navigation";
import GlassPanel from "@/components/ui/Glass";
import LoginButtons from "@/components/auth/LoginButtons";
import { auth } from "@/auth";
import { safeRedirectPath } from "@/lib/safeRedirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = safeRedirectPath(callbackUrl);

  // Já logado (ex: voltou pelo histórico): segue para onde ia.
  const session = await auth();
  if (session?.user) redirect(redirectTo);

  return (
    <main className="min-h-screen text-[#E4E6EB] flex items-center justify-center px-4">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(55,138,221,0.55), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 420, height: 420, bottom: -160, right: -100, background: "radial-gradient(circle, rgba(133,183,235,0.35), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 260, height: 260, top: "55%", left: "62%", background: "radial-gradient(circle, rgba(180,220,255,0.25), transparent 70%)" }} />
      </div>

      <div className="w-full max-w-sm">
        <GlassPanel radius={28} plateClassName="px-9 py-11">
          <div className="mb-[22px] flex items-center justify-center gap-2">
            <span
              className="h-[22px] w-[22px] rounded-[7px]"
              style={{
                background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                boxShadow: "0 0 12px rgba(55,138,221,0.55), inset 0 1px 1px rgba(255,255,255,0.5)",
              }}
            />
            <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-outfit)" }}>
              VagaSync
            </span>
          </div>

          <h1 className="text-[23px] font-semibold text-center mb-2" style={{ fontFamily: "var(--font-outfit)" }}>
            Entrar na sua conta
          </h1>
          <p className="text-sm text-[#A9B2C0] text-center mb-[30px]">
            Organize suas candidaturas com ajuda de IA.
          </p>

          {error && (
            <p role="alert" className="mb-5 rounded-xl border border-[#E5534B]/40 bg-[#E5534B]/10 px-4 py-3 text-sm text-[#E5534B]">
              {error === "AccessDenied"
                ? "Novos cadastros estão temporariamente limitados. Tente de novo mais tarde."
                : "Não foi possível entrar. Tente de novo."}
            </p>
          )}

          <LoginButtons redirectTo={redirectTo} />
        </GlassPanel>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-[#85B7EB] hover:underline">
            Ver como funciona sem entrar →
          </Link>
        </p>
      </div>
    </main>
  );
}

