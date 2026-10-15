import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { listConversations } from "@/lib/messenger-crm";
import { CONVERSATION_FILTERS, type ConversationFilter } from "@/lib/messenger-labels";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  // ?summary=1: just the unread total (sidebar badge).
  if (request.nextUrl.searchParams.get("summary") === "1") {
    const sum = await prisma.messengerConversation.aggregate({ _sum: { unreadCount: true } });
    return NextResponse.json({ unread: sum._sum.unreadCount ?? 0 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim() || undefined;
  const filterParam = request.nextUrl.searchParams.get("filter") as ConversationFilter | null;
  const filter = CONVERSATION_FILTERS.some((f) => f.key === filterParam) ? (filterParam as ConversationFilter) : "all";

  return NextResponse.json({ rows: await listConversations(search, filter) });
}
