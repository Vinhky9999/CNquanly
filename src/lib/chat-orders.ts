import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getLatestCashBalance } from "@/lib/cash-ledger";
import { paymentMethodLabel, type ChatOrderInput } from "@/lib/validations/chat-order";

export interface ChatOrderResult {
  transactionId: string;
  code: string;
  total: number;
  customerId: string;
  customerName: string;
  createdCustomer: boolean;
  /** True when the same confirmation was already recorded (double click / retry): nothing new was written. */
  duplicate: boolean;
}

export const orderCode = (transactionId: string) => `#${transactionId.slice(-6).toUpperCase()}`;

/**
 * Confirms a payment received through the Page chat, in ONE database transaction:
 *  1. links (or creates) the customer for the conversation,
 *  2. creates the SALE order with its product lines and cost-basis snapshots, taking the stock out,
 *  3. books the matching "Thu" entry in the cash ledger (so the cash flow and the overview pick it up).
 * Customer spend / order count are derived from SALE orders, so they update with the order itself.
 */
export async function confirmChatPayment(input: ChatOrderInput): Promise<ChatOrderResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { customer: { select: { id: true, name: true } } },
      });
      if (existing) {
        return {
          transactionId: existing.id,
          code: orderCode(existing.id),
          total: Number(existing.totalAmount),
          customerId: existing.customer?.id ?? "",
          customerName: existing.customer?.name ?? "",
          createdCustomer: false,
          duplicate: true,
        };
      }

      const conversation = await tx.messengerConversation.findUnique({ where: { id: input.conversationId } });
      if (!conversation) throw new Error("Không tìm thấy hội thoại");

      let customerId = conversation.customerId;
      let customerName = conversation.customerName;
      let createdCustomer = false;
      if (customerId) {
        const linked = await tx.customer.findUnique({ where: { id: customerId }, select: { name: true } });
        if (linked) customerName = linked.name;
      } else {
        const customer = await tx.customer.create({
          data: { name: conversation.customerName, notes: "Tạo tự động khi chốt đơn từ hội thoại Messenger" },
        });
        await tx.messengerConversation.update({ where: { id: conversation.id }, data: { customerId: customer.id } });
        customerId = customer.id;
        createdCustomer = true;
      }

      let total = 0;
      let totalCost: number | null = null;
      const lines: Prisma.TransactionItemCreateWithoutTransactionInput[] = [];

      for (const line of input.items) {
        let costBasis: number;
        if (line.itemType === "SEALED") {
          const product = await tx.sealedProduct.findUnique({ where: { id: line.itemId } });
          if (!product) throw new Error("Sản phẩm không còn trong kho");
          if (product.quantity < line.quantity) {
            throw new Error(`"${product.name}" chỉ còn ${product.quantity} trong kho, không đủ để xuất ${line.quantity}`);
          }
          costBasis = Number(product.costPrice) * line.quantity;
          await tx.sealedProduct.update({ where: { id: product.id }, data: { quantity: product.quantity - line.quantity } });
        } else {
          const card = await tx.singleCard.findUnique({ where: { id: line.itemId } });
          if (!card) throw new Error("Lá bài không còn trong kho");
          if (card.status === "SOLD") throw new Error(`"${card.cardName}" đã được bán trước đó`);
          if (card.quantity < line.quantity) {
            throw new Error(`"${card.cardName}" chỉ còn ${card.quantity} trong kho, không đủ để xuất ${line.quantity}`);
          }
          costBasis = Number(card.costPrice) * line.quantity;
          const remaining = card.quantity - line.quantity;
          await tx.singleCard.update({
            where: { id: card.id },
            data: { quantity: remaining, status: remaining === 0 ? "SOLD" : card.status },
          });
        }
        const subtotal = line.unitPrice * line.quantity;
        total += subtotal;
        totalCost = (totalCost ?? 0) + costBasis;
        lines.push({
          itemType: line.itemType,
          sealedProduct: line.itemType === "SEALED" ? { connect: { id: line.itemId } } : undefined,
          singleCard: line.itemType === "SINGLE" ? { connect: { id: line.itemId } } : undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal,
          costBasis,
        });
      }

      // No product lines: the owner confirmed a plain payment, so the amount is what he typed.
      // Its cost stays null — it is left out of the profit reports instead of counting as pure profit.
      if (input.items.length === 0) total = input.amount ?? 0;
      if (total <= 0) throw new Error("Tổng tiền đơn phải lớn hơn 0");

      const customer = await tx.customer.findUnique({ where: { id: customerId! } });
      const note = [input.description, input.notes].filter(Boolean).join(" — ") || null;

      const transaction = await tx.transaction.create({
        data: {
          type: "SALE",
          customerId,
          totalAmount: total,
          totalCost,
          notes: note,
          orderType: input.delivery ? "DELIVERY" : "DIRECT",
          recipientName: input.delivery ? customer?.name ?? null : null,
          recipientPhone: input.delivery ? customer?.phone ?? null : null,
          recipientAddress: input.delivery ? customer?.address ?? null : null,
          source: "MESSENGER",
          paymentMethod: input.paymentMethod,
          conversationId: conversation.id,
          idempotencyKey: input.idempotencyKey,
          items: { create: lines },
        },
      });

      const previousBalance = await getLatestCashBalance(tx);
      const method = paymentMethodLabel(input.paymentMethod);
      await tx.cashLedgerEntry.create({
        data: {
          type: "SALE",
          amount: total,
          balanceAfter: previousBalance + total,
          description: `Bán hàng qua Page — ${customerName}${method ? ` (${method})` : ""}`,
          transactionId: transaction.id,
        },
      });

      return {
        transactionId: transaction.id,
        code: orderCode(transaction.id),
        total,
        customerId: customerId!,
        customerName,
        createdCustomer,
        duplicate: false,
      };
    });
  } catch (err) {
    // Two requests with the same key racing: the loser hits the unique index, so return the winner's order.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.transaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { customer: { select: { id: true, name: true } } },
      });
      if (winner) {
        return {
          transactionId: winner.id,
          code: orderCode(winner.id),
          total: Number(winner.totalAmount),
          customerId: winner.customer?.id ?? "",
          customerName: winner.customer?.name ?? "",
          createdCustomer: false,
          duplicate: true,
        };
      }
    }
    throw err;
  }
}
