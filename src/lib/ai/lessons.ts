import { strip } from "@/lib/chat-payment";
import { prisma } from "@/lib/prisma";

// What the owner has taught the assistant. Each lesson is one short rule ("when I ask X, understand Y"); all of them are
// added to the assistant's instructions. The owner can read and delete them in the assistant's memory dialog, and the
// assistant only saves one when the owner asks for it in plain words (see TEACH_INTENT).

export const LESSON_MAX_CHARS = 400;
export const LESSON_MAX_COUNT = 30;

export class LessonError extends Error {}

export interface Lesson {
  id: string;
  content: string;
  createdAt: string;
}

/** "Hãy nhớ…", "từ giờ…", "lần sau…" — the owner is teaching, so saving a lesson is allowed. */
const TEACH_INTENT = /\b(hay nho|nho rang|nho la|nho giup|nho gium|ghi nho|ghi lai|luu lai|luu y rang|tu gio|tu nay ve sau|tu nay tro di|ve sau|lan sau|day cho ban|hay hoc|hoc thuoc|hoc them)\b/;
/** "Quên điều đó đi", "xoá bài học số 2". */
const FORGET_INTENT = /\b(quen|xoa|bo)\b.*\b(bai hoc|quy tac|dieu (do|nay|da nho|da hoc)|ghi nho)\b|\bquen (di|dieu)\b/;

export const isTeachIntent = (message: string) => TEACH_INTENT.test(strip(message));
export const isForgetIntent = (message: string) => FORGET_INTENT.test(strip(message));

const tidy = (content: string) => content.replace(/\s+/g, " ").trim();

export async function listLessons(): Promise<Lesson[]> {
  const rows = await prisma.assistantLesson.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.createdAt.toISOString() }));
}

/** Saves a lesson. The same text twice is kept once. Throws LessonError with a Vietnamese message the owner can read. */
export async function addLesson(content: string): Promise<{ lesson: Lesson; duplicate: boolean }> {
  const text = tidy(content);
  if (text.length < 5) throw new LessonError("Bài học quá ngắn. Hãy viết rõ một quy tắc hoặc cách hiểu.");
  if (text.length > LESSON_MAX_CHARS) throw new LessonError(`Bài học tối đa ${LESSON_MAX_CHARS} ký tự. Hãy viết ngắn gọn hơn hoặc tách thành nhiều ý.`);

  const existing = await listLessons();
  const same = existing.find((l) => strip(l.content) === strip(text));
  if (same) return { lesson: same, duplicate: true };
  if (existing.length >= LESSON_MAX_COUNT) throw new LessonError(`Trợ lý đã nhớ ${LESSON_MAX_COUNT} điều, đầy rồi. Hãy xoá bớt bài cũ trong bộ nhớ của trợ lý.`);

  const row = await prisma.assistantLesson.create({ data: { content: text } });
  return { lesson: { id: row.id, content: row.content, createdAt: row.createdAt.toISOString() }, duplicate: false };
}

export async function deleteLesson(id: string): Promise<boolean> {
  const { count } = await prisma.assistantLesson.deleteMany({ where: { id } });
  return count > 0;
}

/** Deletes lesson number `n` of the list the assistant sees (1 = oldest). Returns the removed text, or null. */
export async function deleteLessonByNumber(n: number): Promise<string | null> {
  const all = await listLessons();
  const target = all[n - 1];
  if (!target) return null;
  await deleteLesson(target.id);
  return target.content;
}
