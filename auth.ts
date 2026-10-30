import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";
import { allowSignIn } from "@/lib/signupGuard";

// Duração da sessão JWT: 30 dias.
// JWT nao e revogado apagando Session. Logout remove o cookie local;
// operacoes admin revalidam o papel no banco a cada requisicao.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 dias em segundos

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
    // updateAge: a cada quanto tempo o token é renovado silenciosamente
    // enquanto o usuário está ativo. 24h significa que um usuário ativo
    // diariamente nunca percebe a sessão expirando.
    updateAge: 24 * 60 * 60,
  },

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    // Recusa conta nova acima do teto diário (lib/signupGuard.ts); o Auth.js
    // manda para /login?error=AccessDenied.
    async signIn({ user, account }) {
      if (!account) return true;
      return allowSignIn(user.email, account.provider, account.providerAccountId);
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as typeof user & { isAdmin: boolean }).isAdmin ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
  },
});
