import { readJobJson, object } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

// Só dois campos editáveis por aqui: o override de limite diário de IA e o
// isAdmin de OUTRA conta (promover/rebaixar). Duas travas no isAdmin:
//  - ninguém altera o próprio (evita se trancar fora sem querer);
//  - ninguém altera o do dono da instância (User.isOwner) — o dono só muda por
//    script/banco. isOwner nunca é lido do body: não dá para virar dono pela API.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = object(await readJobJson(req)); }
  catch { return NextResponse.json({ error: "Corpo inv\u00e1lido ou muito grande." }, { status: 400 }); }
  const { dailyAiLimitOverride, isAdmin } = body;

  if (isAdmin !== undefined && typeof isAdmin !== "boolean") return NextResponse.json({ error: "isAdmin inv\u00e1lido." }, { status: 400 });

  // Ninguem pode alterar o proprio isAdmin — evita se trancar fora
  if (id === user.id && isAdmin !== undefined) {
    return NextResponse.json(
      { error: "Você não pode alterar seu próprio acesso de admin por aqui." },
      { status: 400 }
    );
  }

  // Ninguem pode alterar o isAdmin do owner pela UI — nem outros admins.
  // O owner so pode ser definido diretamente no banco via SQL/seed.
  if (isAdmin !== undefined) {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { isOwner: true },
    });
    if (target?.isOwner) {
      return NextResponse.json(
        { error: "O acesso de admin do dono da instância não pode ser alterado pela interface." },
        { status: 400 }
      );
    }
  }

  if (
    dailyAiLimitOverride !== undefined &&
    dailyAiLimitOverride !== null &&
    (typeof dailyAiLimitOverride !== "number" || dailyAiLimitOverride <= 0 || !Number.isSafeInteger(dailyAiLimitOverride) || (typeof dailyAiLimitOverride === "number" && dailyAiLimitOverride > 2147483647))
  ) {
    return NextResponse.json(
      { error: "dailyAiLimitOverride precisa ser um inteiro positivo, ou null para usar o padrão global." },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(dailyAiLimitOverride !== undefined ? { dailyAiLimitOverride } : {}),
        ...(isAdmin !== undefined ? { isAdmin } : {}),
      },
      select: { id: true, isAdmin: true, dailyAiLimitOverride: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar usuário (admin):", error);
    return NextResponse.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }
}
