import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { NOTE_MAX_CHARS, getAssistantNote, saveAssistantNote } from "@/lib/ai/notes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  content: z.string().max(NOTE_MAX_CHARS, `Ghi chú tối đa ${NOTE_MAX_CHARS} ký tự`),
});

/** The owner's own context for the assistant (goals, plans, constraints). Read by the deep analysis. */
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const note = await getAssistantNote();
    return NextResponse.json({ content: note.content, updatedAt: note.updatedAt, maxChars: NOTE_MAX_CHARS });
  } catch {
    return NextResponse.json({ error: "Không đọc được ghi chú" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  try {
    const note = await saveAssistantNote(parsed.data.content);
    return NextResponse.json({ content: note.content, updatedAt: note.updatedAt, maxChars: NOTE_MAX_CHARS });
  } catch {
    return NextResponse.json({ error: "Không lưu được ghi chú" }, { status: 500 });
  }
}
