"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  getMessengerSettings,
  previewOf,
  sendToMessenger,
  testPageToken,
} from "@/lib/messenger";

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
  /** SENT = delivered to Messenger, LOCAL = only saved here (no connection / simulated), FAILED = Meta refused. */
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
  const live = Boolean(settings.pageAccessToken) && !conversation.isSimulated;

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
    warning = conversation.isSimulated
      ? "Hội thoại mô phỏng: tin nhắn chỉ lưu trong hệ thống."
      : "Chưa kết nối Page: tin nhắn chỉ lưu trong hệ thống, chưa gửi tới khách.";
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

/** Creates a fake customer message so the inbox can be tried (and tested) without Meta. */
export async function simulateInboundAction(
  conversationId: string | null,
  customerName: string,
  text: string
): Promise<{ error?: string; conversationId?: string }> {
  const d = await denied();
  if (d) return { error: d };
  const body = text.trim();
  if (!body) return { error: "Nhập nội dung tin nhắn của khách" };

  let conversation = conversationId
    ? await prisma.messengerConversation.findUnique({ where: { id: conversationId } })
    : null;

  if (!conversation) {
    const name = customerName.trim();
    if (!name) return { error: "Nhập tên khách hàng" };
    conversation = await prisma.messengerConversation.create({
      data: { psid: `sim_${crypto.randomBytes(6).toString("hex")}`, customerName: name, isSimulated: true },
    });
  } else if (!conversation.isSimulated) {
    return { error: "Chỉ mô phỏng được trong hội thoại mô phỏng" };
  }

  await prisma.messengerMessage.create({ data: { conversationId: conversation.id, direction: "IN", text: body } });
  await prisma.messengerConversation.update({
    where: { id: conversation.id },
    data: { lastMessageText: body, lastMessageAt: new Date(), unreadCount: { increment: 1 } },
  });
  return { conversationId: conversation.id };
}

/** Saves the Page connection. Blank token / secret fields keep what is stored. */
export async function saveMessengerConfigAction(
  _prev: MessengerActionState,
  formData: FormData
): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };

  const token = String(formData.get("pageAccessToken") ?? "").trim();
  const secret = String(formData.get("appSecret") ?? "").trim();
  const pageIdInput = String(formData.get("pageId") ?? "").trim();

  await getMessengerSettings(); // makes sure the row exists
  const data: { pageId?: string | null; pageName?: string | null; pageAccessToken?: string; appSecret?: string } = {};

  if (token) {
    const check = await testPageToken(token);
    if (!check.ok) return { error: `Token không hợp lệ: ${check.error}` };
    data.pageAccessToken = token;
    data.pageId = check.pageId;
    data.pageName = check.pageName;
  } else if (pageIdInput) {
    data.pageId = pageIdInput;
  }
  if (secret) data.appSecret = secret;

  await prisma.messengerConfig.update({ where: { id: "default" }, data });
  revalidatePath("/messages");
  return { success: true, message: data.pageName ? `Đã kết nối Page "${data.pageName}"` : "Đã lưu cấu hình" };
}

export async function testMessengerConnectionAction(): Promise<MessengerActionState> {
  const d = await denied();
  if (d) return { error: d };
  const settings = await getMessengerSettings();
  if (!settings.pageAccessToken) return { error: "Chưa nhập Page Access Token" };
  const check = await testPageToken(settings.pageAccessToken);
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
