import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const conversation = await prisma.messengerConversation.findUnique({ where: { id: params.id } });
  if (!conversation) return NextResponse.json({ error: "Không tìm thấy hội thoại" }, { status: 404 });

  const messages = await prisma.messengerMessage.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  // Newest order created from this chat: payment hints older than it were already handled.
  const lastOrder = await prisma.transaction.findFirst({
    where: { conversationId: params.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return NextResponse.json({ conversation, messages, lastOrderAt: lastOrder?.createdAt ?? null });
}
