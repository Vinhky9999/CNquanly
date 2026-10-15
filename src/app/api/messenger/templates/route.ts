import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getTemplates } from "@/lib/messenger-crm";

export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return NextResponse.json({ templates: await getTemplates() });
}
