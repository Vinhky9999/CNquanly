import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getConversationProfile } from "@/lib/messenger-crm";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const profile = await getConversationProfile(params.id);
  return profile ? NextResponse.json(profile) : NextResponse.json({ error: "Không tìm thấy hội thoại" }, { status: 404 });
}
