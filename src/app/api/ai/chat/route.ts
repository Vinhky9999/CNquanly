import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { chatModel, claudeEnabled, runAssistant } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";
// A Claude answer may need several database lookups plus model calls.
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1, "Thiếu nội dung câu hỏi")
    .max(40),
});

// Light protection against runaway loops / costs: at most 30 questions per 5 minutes per server instance.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 30;
const hits: number[] = [];

function rateLimited(): boolean {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0] > WINDOW_MS) hits.shift();
  if (hits.length >= MAX_REQUESTS) return true;
  hits.push(now);
  return false;
}

/** Which engine answers: Claude when ANTHROPIC_API_KEY is set, otherwise the built-in keyword engine. */
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return NextResponse.json(claudeEnabled() ? { mode: "claude", model: chatModel() } : { mode: "basic", model: null });
}

export async function POST(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const json = await request.json().catch(() => null);
  if (!json || typeof json !== "object") return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ" }, { status: 400 });
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { messages } = parsed.data;
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Tin nhắn cuối cùng phải là câu hỏi của bạn" }, { status: 400 });
  }
  if (rateLimited()) {
    return NextResponse.json({ error: "Bạn hỏi hơi nhanh, đợi vài phút rồi thử lại nhé." }, { status: 429 });
  }

  try {
    return NextResponse.json(await runAssistant(messages));
  } catch {
    return NextResponse.json({ error: "Trợ lý gặp lỗi khi tra cứu dữ liệu. Thử lại sau." }, { status: 500 });
  }
}
