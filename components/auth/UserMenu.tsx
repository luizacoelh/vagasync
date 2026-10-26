import Link from "next/link";
import { signOut } from "@/auth";
import type { Session } from "next-auth";

export default function UserMenu({ user }: { user: Session["user"] }) {
  return (
    <div className="flex items-center gap-3">
      {/* Foto + nome viram o link de perfil — elimina o botão "Perfil" redundante */}
      <Link
        href="/perfil"
        className="flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-white/6"
        title="Editar perfil"
      >
        {user.image && (
          // eslint-disable-next-line @next/next/no-img-element -- avatar vem de host externo (Google/GitHub)
          <img
            src={user.image}
            alt={user.name ?? "Usuário"}
            className="h-8 w-8 rounded-full border border-white/15"
          />
        )}
        <span
          className="hidden text-sm text-[#C4C7D0] sm:inline"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          {user.name ?? user.email}
        </span>
      </Link>

      {user.isAdmin && (
        <Link
          href="/admin"
          className="text-xs text-[#7C8494] hover:text-[#85B7EB] transition-colors"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          Admin
        </Link>
      )}

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="text-xs text-[#7C8494] hover:text-[#E5534B] transition-colors"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          Sair
        </button>
      </form>
    </div>
  );
}
