import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared "luxury showroom" card treatment for Overview/summary cards — deep
// slate glass + a soft amber glow on hover in dark mode, kept subtle in light
// mode so the effect doesn't clash outside the dark theme it was designed for.
export const LUXURY_CARD_CLASS =
  "relative overflow-hidden rounded-2xl border-border/60 bg-card shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/60 dark:shadow-black/20 dark:hover:border-amber-500/30 dark:hover:shadow-lg dark:hover:shadow-amber-500/5";

export function formatVND(value: number | string | { toString(): string }) {
  const num = typeof value === "object" ? Number(value.toString()) : Number(value);
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function randomSuffix(len = 5) {
  return Math.random()
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, len)
    .padEnd(len, "0");
}

export function generateSku(prefix: "SLD" | "SGL") {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `${prefix}-${datePart}-${randomSuffix()}`;
}

/**
 * Checks a name follows the standardized "A - B - C" structure required by
 * the "Thêm hàng" forms (e.g. "Charizard - Base Set - 4/102" or
 * "Pokémon - Scarlet & Violet 151 - Elite Trainer Box") — exactly 3 non-empty
 * segments separated by " - ".
 */
export function isStructuredName(value: string): boolean {
  const parts = value
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length === 3;
}
