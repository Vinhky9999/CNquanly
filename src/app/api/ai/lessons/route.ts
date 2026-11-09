import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/lib/api-auth";
import { LESSON_MAX_CHARS, LESSON_MAX_COUNT, LessonError, addLesson, deleteLesson, listLessons } from "@/lib/ai/lessons";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  content: z
    .string({ required_error: "Hãy nhập điều muốn dạy trợ lý", invalid_type_error: "Bài học phải là một đoạn chữ" })
    .min(1, "Hãy nhập điều muốn dạy trợ lý")
    .max(2000, `Bài học tối đa ${LESSON_MAX_CHARS} ký tự`),
});

const limits = { maxChars: LESSON_MAX_CHARS, maxCount: LESSON_MAX_COUNT };

/** What the owner has taught the assistant (read, add and delete from the assistant's memory dialog). */
export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    return NextResponse.json({ lessons: await listLessons(), ...limits });
  } catch {
    return NextResponse.json({ error: "Không đọc được danh sách bài học" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  try {
    const { lesson, duplicate } = await addLesson(parsed.data.content);
    return NextResponse.json({ lesson, duplicate, lessons: await listLessons(), ...limits }, { status: duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof LessonError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Không lưu được bài học" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu mã bài học" }, { status: 400 });
  try {
    if (!(await deleteLesson(id))) return NextResponse.json({ error: "Không tìm thấy bài học (có thể đã bị xoá)" }, { status: 404 });
    return NextResponse.json({ lessons: await listLessons(), ...limits });
  } catch {
    return NextResponse.json({ error: "Không xoá được bài học" }, { status: 500 });
  }
}
