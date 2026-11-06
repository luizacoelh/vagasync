import { readJobJson, object } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDeletedAccount } from "@/lib/deletedAccount";
import { requireAdmin } from "@/lib/adminAuth";
import { MAX_SAMPLE_OVERRIDE_HOURS, sampleTargetUserId } from "@/lib/monitoredSample";

export const runtime = "nodejs";

// Campos editáveis por aqui: o override de limite diário de IA, a amostra de
// /monitoradas (sampleHours: N = liberar por N horas a partir de agora, 0 =
// bloquear, null = voltar à regra padrão) e o isAdmin de OUTRA conta
// (promover/rebaixar). Duas travas no isAdmin:
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
  const { dailyAiLimitOverride, isAdmin, sampleHours } = body;

  if (isAdmin !== undefined && typeof isAdmin !== "boolean") return NextResponse.json({ error: "isAdmin inv\u00e1lido." }, { status: 400 });

  // Ninguem pode alterar o proprio isAdmin — evita se trancar fora
  if (id === user.id && isAdmin !== undefined) {
    return NextResponse.json(
      { error: "Você não pode alterar seu próprio acesso de admin por aqui." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { isOwner: true, name: true, email: true },
  });
  // Conta excluída (lib/accountDeletion.ts) fica sem IA e sem admin: devolver
  // isso daria acesso a quem ainda tem o JWT antigo.
  if (target && isDeletedAccount(target)) {
    return NextResponse.json({ error: "Conta excluída não pode ser alterada." }, { status: 400 });
  }

  // Ninguem pode alterar o isAdmin do owner pela UI — nem outros admins.
  // O owner so pode ser definido diretamente no banco via SQL/seed.
  if (isAdmin !== undefined) {
    if (target?.isOwner) {
      return NextResponse.json(
        { error: "O acesso de admin do dono da instância não pode ser alterado pela interface." },
        { status: 400 }
      );
    }
  }

  if (
    sampleHours !== undefined &&
    sampleHours !== null &&
    (typeof sampleHours !== "number" || !Number.isInteger(sampleHours) || sampleHours < 0 || sampleHours > MAX_SAMPLE_OVERRIDE_HOURS)
  ) {
    return NextResponse.json(
      { error: `sampleHours precisa ser um inteiro de 0 a ${MAX_SAMPLE_OVERRIDE_HOURS}, ou null para a regra padrão.` },
      { status: 400 }
    );
  }
  if (sampleHours !== undefined && id === sampleTargetUserId()) {
    return NextResponse.json({ error: "Esta conta já recebe as vagas do n8n." }, { status: 400 });
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
        ...(sampleHours !== undefined
          ? { monitoredTrialUntil: sampleHours === null ? null : new Date(Date.now() + sampleHours * 3600000) }
          : {}),
      },
      select: { id: true, isAdmin: true, dailyAiLimitOverride: true, monitoredTrialUntil: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar usuário (admin):", error);
    return NextResponse.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }
}
