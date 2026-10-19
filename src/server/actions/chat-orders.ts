"use server";

import { revalidatePath } from "next/cache";

import { confirmChatPayment } from "@/lib/chat-orders";
import { chatOrderSchema, type ChatOrderInput } from "@/lib/validations/chat-order";

export interface ChatOrderActionResult {
  error?: string;
  order?: { id: string; code: string; total: number; customerName: string; createdCustomer: boolean; duplicate: boolean };
}

/** "Đã thanh toán / Chốt đơn" from the Page chat: order + customer link + cash-flow income in one go. */
export async function confirmChatPaymentAction(input: ChatOrderInput): Promise<ChatOrderActionResult> {
  const parsed = chatOrderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

  try {
    const result = await confirmChatPayment(parsed.data);
    for (const path of ["/", "/cash-flow", "/customers", "/inventory", "/shipping", "/messages"]) revalidatePath(path);
    return {
      order: {
        id: result.transactionId,
        code: result.code,
        total: result.total,
        customerName: result.customerName,
        createdCustomer: result.createdCustomer,
        duplicate: result.duplicate,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thể ghi nhận thanh toán" };
  }
}
