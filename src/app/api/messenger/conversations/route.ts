import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  // ?summary=1: just the unread total (sidebar badge).
  if (request.nextUrl.searchParams.get("summary") === "1") {
    const sum = await prisma.messengerConversation.aggregate({ _sum: { unreadCount: true } });
    return NextResponse.json({ unread: sum._sum.unreadCount ?? 0 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();
  const rows = await prisma.messengerConversation.findMany({
    where: search
      ? {
          OR: [
            { customerName: { contains: search, mode: "insensitive" } },
            { lastMessageText: { contains: search, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ rows });
}
