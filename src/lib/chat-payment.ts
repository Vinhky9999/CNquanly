// Detects payment signals in a Page chat:
//  - CONFIRMED: Messenger's own card "Đã xác nhận khoản thanh toán / Đã đính kèm biên lai" (sent by either side),
//  - HINT: the customer announcing a transfer ("đã ck", "chuyển khoản rồi", "gửi bill"...).
// Pure text helpers shared by the webhook (auto-recording) and the chat UI (suggestion banner).

export const strip = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");

const HINTS: RegExp[] = [
  /\b(da|vua|moi)\s+(ck|chuyen khoan|chuyen tien|thanh toan|tt|banking|bank)\b/,
  /\b(ck|chuyen khoan|chuyen tien|thanh toan|banking)\s+(roi|xong|nha|nhe)\b/,
  /\b(bill|bien lai|sao ke)\b/,
];

const CONFIRMATIONS: RegExp[] = [
  /xac nhan (khoan )?(thanh toan|chuyen khoan)/,
  /da dinh kem bien lai/,
  /payment (confirmed|received)/,
];

export function looksLikePaymentNotice(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = strip(text);
  return HINTS.some((re) => re.test(normalized));
}

/** Messenger's "Đã xác nhận khoản thanh toán" card (or the same sentence typed by hand). */
export function isPaymentConfirmation(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = strip(text);
  return CONFIRMATIONS.some((re) => re.test(normalized));
}

/**
 * Reads a VND amount from free text, conservatively: only numbers written with thousand separators
 * ("3.500.000", "3,500,000"), a currency marker ("3500000 vnd") or a shorthand ("500k", "3tr5", "2 triệu").
 * Phone numbers, dates and transaction codes are never taken. Returns null when nothing clear is found.
 */
export function parseAmountVnd(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = strip(text);
  const found: number[] = [];

  // 3tr5 / 3 trieu 5 / 2 trieu / 1tr250
  for (const m of s.matchAll(/(\d{1,3})\s*(?:tr|trieu)\s*(\d{1,3})?(?![\d])/g)) {
    const millions = Number(m[1]);
    const rest = m[2] ? (m[2].length === 1 ? Number(m[2]) * 100_000 : m[2].length === 2 ? Number(m[2]) * 10_000 : Number(m[2]) * 1_000) : 0;
    found.push(millions * 1_000_000 + rest);
  }
  // 500k / 500 nghin / 500 ngan
  for (const m of s.matchAll(/(\d{1,4})\s*(?:k|nghin|ngan)\b/g)) found.push(Number(m[1]) * 1_000);
  // 3.500.000 / 3,500,000 / 1.250.000d
  for (const m of s.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+)(?![\d]|[.,]\d)/g)) found.push(Number(m[1].replace(/[.,]/g, "")));
  // 3500000 vnd / vnd 3500000 / 3500000d
  for (const m of s.matchAll(/(?:vnd|d)\s*(\d{4,10})(?!\d)|(?<![\d.,])(\d{4,10})\s*(?:vnd|d)\b/g)) found.push(Number(m[1] ?? m[2]));

  const plausible = found.filter((n) => n >= 1_000 && n <= 2_000_000_000);
  if (plausible.length === 0) return null;
  // Several different figures in one message are ambiguous: do not guess.
  return new Set(plausible).size === 1 ? plausible[0] : null;
}

/** How far back a customer message still counts as a pending payment notice. */
export const PAYMENT_HINT_WINDOW_MS = 48 * 60 * 60 * 1000;

interface HintMessage {
  id: string;
  direction: "IN" | "OUT";
  text: string | null;
  createdAt: string;
}

export interface PaymentNotice<T extends HintMessage> {
  message: T;
  kind: "CONFIRMED" | "HINT";
  /** Amount found in the notice or in the customer's messages around it, if any. */
  amount: number | null;
}

/**
 * The newest recent payment signal that no order from this chat has handled yet (messages up to the last order are
 * considered done). A Messenger confirmation outranks a customer's "đã ck".
 */
export function findPaymentNotice<T extends HintMessage>(
  messages: T[],
  lastOrderAt: string | null,
  now = Date.now()
): PaymentNotice<T> | null {
  const after = lastOrderAt ? new Date(lastOrderAt).getTime() : 0;
  let hint: PaymentNotice<T> | null = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const at = new Date(m.createdAt).getTime();
    if (at <= after || now - at > PAYMENT_HINT_WINDOW_MS) break;

    const confirmed = isPaymentConfirmation(m.text);
    if (!confirmed && !(m.direction === "IN" && looksLikePaymentNotice(m.text))) continue;

    let amount = parseAmountVnd(m.text);
    for (let j = i - 1; amount === null && j >= 0 && j >= i - 6; j--) {
      if (messages[j].direction === "IN") amount = parseAmountVnd(messages[j].text);
    }
    const found: PaymentNotice<T> = { message: m, kind: confirmed ? "CONFIRMED" : "HINT", amount };
    if (confirmed) return found;
    hint ??= found;
  }
  return hint;
}
