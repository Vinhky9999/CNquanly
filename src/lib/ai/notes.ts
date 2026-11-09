import { prisma } from "@/lib/prisma";

// The owner's own context for the analyst: exchange rate he watches, tax / customs news, release dates of new sets,
// profit targets, plans. It is entered on the assistant page and added to the system prompt of every question.

export const NOTE_MAX_CHARS = 4000;

export async function getAssistantNote(): Promise<{ content: string; updatedAt: string | null }> {
  const row = await prisma.assistantNote.findUnique({ where: { id: "default" } });
  return { content: row?.content ?? "", updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function saveAssistantNote(content: string): Promise<{ content: string; updatedAt: string }> {
  const trimmed = content.trim().slice(0, NOTE_MAX_CHARS);
  const row = await prisma.assistantNote.upsert({
    where: { id: "default" },
    update: { content: trimmed },
    create: { id: "default", content: trimmed },
  });
  return { content: row.content, updatedAt: row.updatedAt.toISOString() };
}
