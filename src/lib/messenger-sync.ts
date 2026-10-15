import { prisma } from "@/lib/prisma";
import { graph, previewOf } from "@/lib/messenger";

// Imports the Page's existing conversation history from the Graph API (Conversations edge), a few
// conversations per call so one request stays well inside the serverless time limit. Messages are
// de-duplicated by Meta's message id, so syncing again (or alongside the live webhook) never duplicates.

const MESSAGES_PER_PAGE = 100;
const MAX_MESSAGE_PAGES = 5; // up to 500 newest-first messages per conversation

export interface SyncStep {
  ok: boolean;
  error?: string;
  conversations: number;
  messages: number;
  /** Cursor for the next call; null when every conversation has been processed. */
  next: string | null;
}

interface GraphMessage {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string };
  attachments?: { data?: { mime_type?: string; image_data?: { url?: string }; file_url?: string }[] };
}

async function getJson(url: string): Promise<{ ok: boolean; json: any }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && !json?.error, json };
  } catch (err) {
    return { ok: false, json: { error: { message: err instanceof Error ? err.message : "Không kết nối được Meta" } } };
  }
}

function explain(message: string): string {
  if (/permission|#10|#200|#100/i.test(message)) {
    return `${message} — Token cần quyền pages_messaging (thêm use case “Tương tác với khách hàng trên Messenger”) rồi kết nối lại.`;
  }
  return message;
}

async function importConversation(conv: any, pageId: string, token: string): Promise<number> {
  const customer = (conv.participants?.data ?? []).find((p: any) => String(p.id) !== pageId);
  if (!customer?.id) return 0;
  const psid = String(customer.id);

  // Messages come newest first; follow the paging links for older ones.
  const collected: GraphMessage[] = [];
  let first = await graph(
    `/${conv.id}/messages?fields=id,message,created_time,from,attachments{mime_type,image_data,file_url}&limit=${MESSAGES_PER_PAGE}`,
    token
  );
  if (!first.ok) throw new Error(String(first.json?.error?.message ?? "Không đọc được tin nhắn"));
  collected.push(...(first.json.data ?? []));
  let nextUrl: string | undefined = first.json.paging?.next;
  for (let page = 1; nextUrl && page < MAX_MESSAGE_PAGES; page++) {
    const more = await getJson(nextUrl);
    if (!more.ok) break;
    collected.push(...(more.json.data ?? []));
    nextUrl = more.json.paging?.next;
  }
  if (collected.length === 0) return 0;

  const rows = collected.map((m) => {
    const image = m.attachments?.data?.find((a) => a.image_data?.url)?.image_data?.url ?? null;
    const hasFile = Boolean(m.attachments?.data?.length) && !image;
    return {
      direction: (String(m.from?.id) === pageId ? "OUT" : "IN") as "OUT" | "IN",
      text: m.message?.trim() ? m.message : hasFile ? "[Tệp đính kèm]" : null,
      imageUrl: image,
      mid: m.id,
      createdAt: m.created_time ? new Date(m.created_time) : new Date(),
    };
  });

  const newest = rows.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
  const existing = await prisma.messengerConversation.findUnique({ where: { psid } });
  const conversation =
    existing ??
    (await prisma.messengerConversation.create({
      data: {
        psid,
        customerName: String(customer.name ?? `Khách ${psid.slice(-4)}`),
        lastMessageAt: newest.createdAt,
        lastMessageText: previewOf(newest.text, newest.imageUrl),
      },
    }));

  const created = await prisma.messengerMessage.createMany({
    data: rows.map((r) => ({ ...r, conversationId: conversation.id })),
    skipDuplicates: true,
  });

  // Keep the list preview on the genuinely newest message (the webhook may already hold a newer one).
  if (existing && newest.createdAt > existing.lastMessageAt) {
    await prisma.messengerConversation.update({
      where: { id: existing.id },
      data: { lastMessageAt: newest.createdAt, lastMessageText: previewOf(newest.text, newest.imageUrl) },
    });
  }
  return created.count;
}

/** Processes the next `batch` conversations after `cursor` (null = from the start). */
export async function syncHistoryStep(
  token: string,
  pageId: string,
  cursor: string | null,
  batch = 4
): Promise<SyncStep> {
  const list = await graph(
    `/${pageId}/conversations?platform=messenger&fields=id,updated_time,participants&limit=${batch}${
      cursor ? `&after=${encodeURIComponent(cursor)}` : ""
    }`,
    token
  );
  if (!list.ok) {
    return { ok: false, error: explain(String(list.json?.error?.message ?? "Không đọc được danh sách hội thoại")), conversations: 0, messages: 0, next: null };
  }

  let conversations = 0;
  let messages = 0;
  for (const conv of list.json.data ?? []) {
    try {
      messages += await importConversation(conv, pageId, token);
      conversations += 1;
    } catch (err) {
      return {
        ok: false,
        error: explain(err instanceof Error ? err.message : "Lỗi khi đọc tin nhắn"),
        conversations,
        messages,
        next: null,
      };
    }
  }

  const paging = list.json.paging;
  const next = paging?.next && paging?.cursors?.after ? String(paging.cursors.after) : null;
  return { ok: true, conversations, messages, next };
}
