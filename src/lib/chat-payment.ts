// Detects customer messages that announce a payment ("đã ck", "chuyển khoản rồi", "gửi bill"...).
// It only raises a suggestion in the chat: money is never booked until the owner confirms it himself.

const strip = (text: string) =>
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

export function looksLikePaymentNotice(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = strip(text);
  return HINTS.some((re) => re.test(normalized));
}

/** How far back a customer message still counts as a pending payment notice. */
export const PAYMENT_HINT_WINDOW_MS = 48 * 60 * 60 * 1000;

interface HintMessage {
  id: string;
  direction: "IN" | "OUT";
  text: string | null;
  createdAt: string;
}

/**
 * The newest customer message that announces a payment, if it is recent and no order was confirmed from
 * this chat after it.
 */
export function findPaymentNotice<T extends HintMessage>(messages: T[], lastOrderAt: string | null, now = Date.now()): T | null {
  const after = lastOrderAt ? new Date(lastOrderAt).getTime() : 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.direction !== "IN") continue;
    const at = new Date(m.createdAt).getTime();
    if (at <= after || now - at > PAYMENT_HINT_WINDOW_MS) return null;
    if (looksLikePaymentNotice(m.text)) return m;
  }
  return null;
}
