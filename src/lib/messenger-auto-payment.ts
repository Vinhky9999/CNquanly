import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { confirmChatPayment } from "@/lib/chat-orders";
import { isPaymentConfirmation, parseAmountVnd } from "@/lib/chat-payment";
import { readReceipt, receiptOcrEnabled } from "@/lib/receipt-ocr";

export type AutoPaymentResult =
  | { status: "NOT_PAYMENT" }
  /** Messenger confirmed a payment but no amount could be read: the chat shows a banner asking for it. */
  | { status: "NEEDS_AMOUNT" }
  | { status: "DUPLICATE" }
  | { status: "RECORDED"; code: string; total: number };

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Runs for every stored chat message. When it is Messenger's "Đã xác nhận khoản thanh toán" card, the order is booked
 * with no click: customer linked/created, SALE order (so spend + order count update), and the income entry in the cash
 * flow. The amount comes from the card / the customer's own messages, or — when ANTHROPIC_API_KEY is set — from the
 * receipt screenshot the customer sent before the confirmation. If no amount is clear nothing is booked.
 */
export async function autoRecordMessengerPayment(input: {
  conversationId: string;
  mid: string | null;
  text: string | null;
  at: Date;
}): Promise<AutoPaymentResult> {
  if (!isPaymentConfirmation(input.text)) return { status: "NOT_PAYMENT" };

  const recent = await prisma.messengerMessage.findMany({
    where: {
      conversationId: input.conversationId,
      createdAt: { gte: new Date(input.at.getTime() - LOOKBACK_MS), lte: input.at },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { direction: true, text: true, imageUrl: true },
  });

  let amount = parseAmountVnd(input.text);
  let transactionCode: string | null = null;
  let fromReceipt = false;

  for (const m of recent) {
    if (amount !== null) break;
    if (m.direction === "IN") amount = parseAmountVnd(m.text);
  }
  if (amount === null && receiptOcrEnabled()) {
    for (const m of recent.filter((r) => r.direction === "IN" && r.imageUrl).slice(0, 3)) {
      const reading = await readReceipt(m.imageUrl!);
      if (reading) {
        amount = reading.amount;
        transactionCode = reading.transactionCode;
        fromReceipt = true;
        break;
      }
    }
  }
  if (amount === null) return { status: "NEEDS_AMOUNT" };

  // The owner may already have confirmed this same payment by hand a moment ago.
  const already = await prisma.transaction.findFirst({
    where: { conversationId: input.conversationId, totalAmount: amount, createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) } },
    select: { id: true },
  });
  if (already) return { status: "DUPLICATE" };

  const key = transactionCode ? `receipt:${transactionCode}` : `msgr:${input.mid ?? `${input.conversationId}:${input.at.getTime()}`}`;
  const result = await confirmChatPayment(
    {
      conversationId: input.conversationId,
      idempotencyKey: key,
      paymentMethod: "BANK_TRANSFER",
      items: [],
      amount,
      description: `Messenger xác nhận thanh toán${transactionCode ? ` · mã GD ${transactionCode}` : ""}`,
      notes: fromReceipt
        ? "Tự động ghi nhận: số tiền đọc từ ảnh biên lai khách gửi — hãy đối chiếu với sao kê."
        : "Tự động ghi nhận từ thẻ xác nhận thanh toán của Messenger.",
      delivery: false,
    },
    { source: "MESSENGER_AUTO" }
  );
  if (result.duplicate) return { status: "DUPLICATE" };

  try {
    for (const path of ["/", "/cash-flow", "/customers", "/messages"]) revalidatePath(path);
  } catch {
    // Not fatal: pages also refresh on their own polling / next navigation.
  }
  return { status: "RECORDED", code: result.code, total: result.total };
}
