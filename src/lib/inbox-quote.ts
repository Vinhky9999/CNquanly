// Builds the customer-facing text sent from the chat's inventory sidebar. Only fields that are safe to
// show a customer are used — never the cost price.

export interface InboxProduct {
  kind: "SEALED" | "SINGLE";
  id: string;
  sku: string;
  name: string;
  game: string | null;
  quantity: number;
  marketPrice: number | null;
  status: string;
  imageUrl: string | null;
  detail: string | null;
}

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}₫`;

export function availabilityLabel(p: InboxProduct): string {
  if (p.kind === "SEALED") {
    if (p.status === "PRE_ORDER") return "Pre-order";
    if (p.status === "IN_TRANSIT") return "Hàng đang về";
    if (p.status === "ON_HOLD") return "Đang giữ";
    return p.quantity > 0 ? `Còn ${p.quantity}` : "Hết hàng";
  }
  if (p.status === "RESERVED") return "Đã có người giữ";
  return p.quantity > 0 ? `Còn ${p.quantity}` : "Hết hàng";
}

function header(p: InboxProduct): string[] {
  return [
    `📦 ${p.name}`,
    `SKU: ${p.sku}${p.game ? ` · ${p.game}` : ""}${p.detail ? ` · ${p.detail}` : ""}`,
    `Tình trạng: ${availabilityLabel(p)}`,
  ];
}

export function infoMessage(p: InboxProduct): string {
  return header(p).join("\n");
}

export function quoteMessage(p: InboxProduct, price: number): string {
  return [...header(p), `💰 Giá: ${vnd(price)}`].join("\n");
}
