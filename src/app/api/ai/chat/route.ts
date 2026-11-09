import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { chatModel, claudeEnabled, runAssistant, webSearchEnabled } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";
// Standard answers need a few database lookups; the deep analysis may run many tool rounds plus web searches, so it needs
// the long limit (Vercel Pro / Fluid compute allow up to 300 s; on a plan with a lower cap the host stops it earlier).
export const maxDuration = 300;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1, "Thiếu nội dung câu hỏi")
    .max(40),
  deep: z.boolean().optional(),
});

// Light protection against runaway loops / costs, per server instance.
// Normal questions: 30 per 5 minutes. Deep analyses are much more expensive: 5 per 10 minutes.
const hits: number[] = [];
const deepHits: number[] = [];

function limited(list: number[], windowMs: number, max: number): boolean {
  const now = Date.now();
  while (list.length > 0 && now - list[0] > windowMs) list.shift();
  if (list.length >= max) return true;
  list.push(now);
  return false;
}

/** Which engine answers: Claude when ANTHROPIC_API_KEY is set, otherwise the built-in keyword engine. */
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return NextResponse.json(
    claudeEnabled()
      ? { mode: "claude", model: chatModel(), webSearch: webSearchEnabled() }
      : { mode: "basic", model: null, webSearch: false }
  );
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
  const deep = parsed.data.deep === true;
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Tin nhắn cuối cùng phải là câu hỏi của bạn" }, { status: 400 });
  }
  if (deep ? limited(deepHits, 10 * 60 * 1000, 5) : limited(hits, 5 * 60 * 1000, 30)) {
    return NextResponse.json(
      { error: deep ? "Phân tích chuyên sâu khá tốn tài nguyên, đợi vài phút rồi chạy lại nhé." : "Bạn hỏi hơi nhanh, đợi vài phút rồi thử lại nhé." },
      { status: 429 }
    );
  }

  try {
    return NextResponse.json(await runAssistant(messages, { deep }));
  } catch {
    return NextResponse.json({ error: "Trợ lý gặp lỗi khi tra cứu dữ liệu. Thử lại sau." }, { status: 500 });
  }
}
