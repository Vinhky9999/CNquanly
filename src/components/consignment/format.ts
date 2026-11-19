import type { ListingStatus } from "@/lib/consignment/types";

export const formatUSD = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/** USD with a minus sign when negative, e.g. a fee deducted. */
export const formatUSDSigned = (n: number) => (n < 0 ? `-${formatUSD(Math.abs(n))}` : formatUSD(n));

export const formatMoney = (n: number | null | undefined, currency: string) =>
  currency === "USD" ? formatUSD(n) : n === null || n === undefined ? "—" : `${currency} ${n.toFixed(2)}`;

const TZ = "Asia/Ho_Chi_Minh";

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(new Date(iso)) : "—";

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: TZ }).format(new Date(iso)) : "—";

/** ISO date -> value for an <input type="datetime-local"> (the browser's local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO string, or null when empty. */
export const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);

export const STATUS_LABEL: Record<ListingStatus, string> = {
  ACTIVE: "Đang đấu giá",
  ENDED: "Chờ xác nhận kết quả",
  SOLD: "Đã bán",
  UNSOLD: "Không bán được",
};

export const STATUS_VARIANT: Record<ListingStatus, "indigo" | "warning" | "success" | "slate"> = {
  ACTIVE: "indigo",
  ENDED: "warning",
  SOLD: "success",
  UNSOLD: "slate",
};

/** "3 ngày 4 giờ" until the end of the auction, or "Đã quá hạn". */
export function timeLeft(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Đã hết giờ";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0 ? `Còn ${d} ngày ${h} giờ` : h > 0 ? `Còn ${h} giờ ${m} phút` : `Còn ${m} phút`;
}
