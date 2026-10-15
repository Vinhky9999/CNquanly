"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  getMessengerSettings,
  previewOf,
  sendToMessenger,
  testPageToken,
} from "@/lib/messenger";
import { finishPageConnection } from "@/lib/messenger-connect";
import { syncHistoryStep, type SyncStep } from "@/lib/messenger-sync";
import { PENDING_COOKIE, subscribeAppWebhook, unsealPages, verifyAppCredentials } from "@/lib/messenger-oauth";

export interface MessengerActionState {
  error?: string;
  success?: boolean;
  message?: string;
}

async function denied(): Promise<string | null> {
  const session = await getSession();
  return session.isLoggedIn ? null : "Chưa đăng nhập";
}

export interface SendOutcome {
  error?: string;
  /** SENT = delivered to Messenger, LOCAL = only saved here (no connection), FAILED = Meta refused. */
  status?: "SENT" | "LOCAL" | "FAILED";
  warning?: string;
}

const isPublicHttps = (url: string) => /^https:\/\/[^\s]+$/i.test(url) && !/localhost|127\.0\.0\.1/i.test(url);

/** Sends a text and/or an image to the customer of a conversation and stores both in the history. */
export async function sendMessageAction(
  conversationId: string,
  input: { text?: string; imageUrl?: string }
): Promise<SendOutcome> {
  const d = await denied();
  if (d) return { error: d };

  const text = input.text?.trim() ?? "";
  const imageUrl = input.imageUrl?.trim() || null;
  if (!text && !imageUrl) return { error: "Tin nhắn trống" };

  const conversation = await prisma.messengerConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return { error: "Không tìm thấy hội thoại" };

  const settings = await getMessengerSettings();
  const live = Boolean(settings.pageAccessToken);

  let overall: SendOutcome["status"] = live ? "SENT" : "LOCAL";
  let warning: string | undefined;

  const parts: ({ text: string } | { imageUrl: string })[] = [];
  if (text) parts.push({ text });
  if (imageUrl) parts.push({ imageUrl });

  for (const part of parts) {
    let status: "SENT" | "LOCAL" | "FAILED" = live ? "SENT" : "LOCAL";
    let mid: string | undefined;
    let error: string | undefined;

    if (live) {
      if ("imageUrl" in part && !isPublicHttps(part.imageUrl)) {
        status = "FAILED";
        error = "Ảnh phải là đường dẫn https công khai";
      } else {
        const result = await sendToMessenger(settings.pageAccessToken!, conversation.psid, part);
        if (result.ok) mid = result.mid;
        else {
          status = "FAILED";
          error = result.error;
        }
      }
    }

    await prisma.messengerMessage.create({
      data: {
        conversationId,
        direction: "OUT",
        text: "text" in part ? part.text : null,
        imageUrl: "imageUrl" in part ? part.imageUrl : null,
        mid: mid ?? null,
        status,
        error: error ?? null,
      },
    });

    if (status === "FAILED") {
      overall = "FAILED";
      warning = error;
    }
  }

  await prisma.messengerConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: previewOf(text || null, imageUrl),
      lastMessageAt: new Date(),
      unreadCount: 0,
    },
  });

  if (!live) {
    warning = "Chưa kết nối Page: tin nhắn chỉ lưu trong hệ thống, chưa gửi tới khách.";
  }
  return { status: overall, warning };
}

export async function markConversationReadAction(conversationId: string) {
  if (await denied()) return;
  await prisma.messengerConversation.updateMany({ where: { id: conversationId }, data: { unreadCount: 0 } });
}

export async function deleteConversationAction(conversationId: string): Promise<{ error?: string }> {
  const d = await denied();
  if (d) return { error: d };
  await prisma.messengerConversation.delete({ where: { id: conversationId } }).catch(() => null);
  revalidatePath("/messages");
  return {};
}

/** Saves the Page connection. Blank token / secret fields keep what is stored. */
export async function saveMessengerConfigAction(
  _prev: MessengerActionState,
  formData: FormData
): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };

  const token = String(formData.get("pageAccessToken") ?? "").trim();
  if (!token) return { error: "Dán Page Access Token vào ô trên" };

  const creds = await getMessengerSettings();
  const check = await testPageToken(token, creds);
  if (!check.ok) return { error: `Token không hợp lệ: ${check.error}` };

  // Saves the Page, subscribes it to the app and registers the webhook (needs App ID / Secret from step 1).
  const outcome = await finishPageConnection({ id: check.pageId, name: check.pageName, token }, currentOrigin());
  revalidatePath("/messages");
  return {
    success: true,
    message: outcome.warning
      ? `Đã kết nối Page "${check.pageName}" nhưng: ${outcome.warning}`
      : `Đã kết nối Page "${check.pageName}" và bật nhận tin nhắn`,
  };
}

export async function testMessengerConnectionAction(): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };
  const settings = await getMessengerSettings();
  if (!settings.pageAccessToken) return { error: "Chưa nhập Page Access Token" };
  const check = await testPageToken(settings.pageAccessToken, settings);
  if (!check.ok) return { error: check.error };
  await prisma.messengerConfig.update({
    where: { id: "default" },
    data: { pageId: check.pageId, pageName: check.pageName },
  });
  return { success: true, message: `Kết nối ổn — Page "${check.pageName}"` };
}

export async function regenerateVerifyTokenAction(): Promise<MessengerActionState & { verifyToken?: string }> {
  const d = await denied();
  if (d) return { error: d };
  await getMessengerSettings();
  const verifyToken = crypto.randomBytes(16).toString("hex");
  await prisma.messengerConfig.update({ where: { id: "default" }, data: { verifyToken } });
  return { success: true, verifyToken };
}

export async function disconnectMessengerAction(): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };
  await getMessengerSettings();
  await prisma.messengerConfig.update({
    where: { id: "default" },
    data: { pageAccessToken: null, appSecret: null, pageId: null, pageName: null },
  });
  revalidatePath("/messages");
  return { success: true, message: "Đã ngắt kết nối Page" };
}

function currentOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3002";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Saves the Meta App ID / Secret (entered once) that the "Kết nối với Facebook" login uses. */
export async function saveAppCredentialsAction(
  _prev: MessengerActionState,
  formData: FormData
): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };
  const appId = String(formData.get("appId") ?? "").trim();
  const appSecret = String(formData.get("appSecret") ?? "").trim();
  if (appId && !/^\d{6,}$/.test(appId)) return { error: "App ID chỉ gồm chữ số" };

  const current = await getMessengerSettings();
  const data: { appId?: string; appSecret?: string } = {};
  if (appId) data.appId = appId;
  if (appSecret) data.appSecret = appSecret;

  // Check the pair with Meta before saving, so a wrong secret is caught here and not at login time.
  const finalId = data.appId ?? current.appId;
  const finalSecret = data.appSecret ?? current.appSecret;
  if (finalId && finalSecret) {
    const check = await verifyAppCredentials(finalId, finalSecret);
    if (!check.ok) return { error: check.error };
  }
  await prisma.messengerConfig.update({ where: { id: "default" }, data });
  revalidatePath("/messages");
  return { success: true, message: "Đã lưu App ID / App Secret" };
}

/** Finishes the login when the owner manages several Pages and picked one. */
export async function connectPickedPageAction(pageId: string): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };
  const pages = await unsealPages((await cookies()).get(PENDING_COOKIE)?.value);
  const page = pages.find((p) => p.id === pageId);
  if (!page) return { error: "Danh sách Page đã hết hạn, hãy bấm Kết nối với Facebook lại" };

  const outcome = await finishPageConnection(page, currentOrigin());
  cookies().delete(PENDING_COOKIE);
  revalidatePath("/messages");
  return outcome.warning
    ? { success: true, message: `Đã kết nối "${page.name}" nhưng: ${outcome.warning}` }
    : { success: true, message: `Đã kết nối Page "${page.name}" và bật nhận tin nhắn` };
}

/** Re-registers the webhook on the app (e.g. after the domain changed). */
export async function registerWebhookAction(): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };
  const s = await getMessengerSettings();
  if (!s.appId || !s.appSecret) return { error: "Chưa nhập App ID / App Secret" };
  const r = await subscribeAppWebhook(s.appId, s.appSecret, `${currentOrigin()}/api/messenger/webhook`, s.verifyToken);
  return r.ok ? { success: true, message: "Đã đăng ký webhook với Meta" } : { error: r.error };
}

/** One batch of the history import; the browser calls it repeatedly with the returned cursor until it is null. */
export async function syncHistoryStepAction(cursor: string | null): Promise<SyncStep> {
  const d = await denied();
  if (d) return { ok: false, error: d, conversations: 0, messages: 0, next: null };

  const settings = await getMessengerSettings();
  if (!settings.pageAccessToken || !settings.pageId) {
    return { ok: false, error: "Chưa kết nối Page", conversations: 0, messages: 0, next: null };
  }
  const result = await syncHistoryStep(settings.pageAccessToken, settings.pageId, cursor);
  if (result.conversations > 0) revalidatePath("/messages");
  return result;
}

export interface ConversationPatch {
  label?: string | null;
  notes?: string;
  customerId?: string | null;
}

/** CRM fields of a conversation: label, private notes, linked customer. */
export async function updateConversationAction(
  conversationId: string,
  patch: ConversationPatch
): Promise<{ error?: string }> {
  const d = await denied();
  if (d) return { error: d };

  const data: { label?: string | null; notes?: string | null; customerId?: string | null } = {};
  if ("label" in patch) {
    const allowed = ["VIP", "COLLECTOR", "RETAIL", "TRADER", "POTENTIAL"];
    if (patch.label && !allowed.includes(patch.label)) return { error: "Nhãn không hợp lệ" };
    data.label = patch.label || null;
  }
  if ("notes" in patch) data.notes = patch.notes?.trim() ? patch.notes.slice(0, 4000) : null;
  if ("customerId" in patch) data.customerId = patch.customerId || null;

  try {
    await prisma.messengerConversation.update({ where: { id: conversationId }, data });
  } catch {
    return { error: "Không cập nhật được hội thoại" };
  }
  return {};
}

export interface TemplateInput {
  label: string;
  emoji: string;
  content: string;
}

/** Replaces the whole list of canned replies. */
export async function saveTemplatesAction(templates: TemplateInput[]): Promise<{ error?: string }> {
  const d = await denied();
  if (d) return { error: d };

  const clean = templates
    .map((t) => ({
      label: t.label.trim().slice(0, 40),
      emoji: (t.emoji.trim() || "💬").slice(0, 4),
      content: t.content.trim().slice(0, 2000),
    }))
    .filter((t) => t.label && t.content);
  if (clean.length === 0) return { error: "Cần ít nhất một mẫu có tên và nội dung" };
  if (clean.length > 12) return { error: "Tối đa 12 mẫu" };

  await prisma.$transaction([
    prisma.messengerTemplate.deleteMany({}),
    prisma.messengerTemplate.createMany({ data: clean.map((t, position) => ({ ...t, position })) }),
  ]);
  return {};
}
