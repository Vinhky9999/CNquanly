"use client";

import { useEffect, useState } from "react";
import { Copy, MessageSquarePlus, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { availabilityLabel, infoMessage, quoteMessage, type InboxProduct } from "@/lib/inbox-quote";
import { formatVND } from "@/lib/utils";
import type { InsertRequest } from "@/components/messages/chat-panel";

interface InventoryPanelProps {
  /** Null when no conversation is open: results can still be copied but not inserted into a chat. */
  conversationId: string | null;
  /** Puts text (and a picture) into the chat composer. */
  onInsert: (request: Omit<InsertRequest, "nonce">) => void;
}

const isHttps = (url: string | null) => Boolean(url && /^https:\/\//i.test(url));

// Clipboard with a fallback for browsers that block the async API (plain http, in-app webviews).
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

// Inventory lookup beside the chat: search a SKU / name, then drop the card's info or a price quote
// (with its picture) into the composer. Cost price is for the owner's eyes only — it never goes into a message.
export function InventoryPanel({ conversationId, onInsert }: InventoryPanelProps) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InboxProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [withImage, setWithImage] = useState(true);
  // Shown when the browser refuses clipboard access: the text is pre-selected so it can be copied by hand.
  const [manualText, setManualText] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/inventory/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((json) => setRows(json.rows ?? []))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const priceOf = (p: InboxProduct): number | null => {
    const typed = prices[p.id];
    if (typed !== undefined) return Number(typed) > 0 ? Number(typed) : null;
    return p.marketPrice;
  };

  const textFor = (p: InboxProduct, mode: "info" | "quote"): string | null => {
    const price = priceOf(p);
    if (mode === "quote" && price == null) {
      toast.error("Nhập giá báo cho khách");
      return null;
    }
    return mode === "quote" ? quoteMessage(p, price!) : infoMessage(p);
  };

  function insert(p: InboxProduct, mode: "info" | "quote") {
    if (!conversationId) return toast.error("Hãy chọn một hội thoại trước");
    const text = textFor(p, mode);
    if (!text) return;
    onInsert({ text, imageUrl: withImage && isHttps(p.imageUrl) ? p.imageUrl! : undefined });
    toast.success(mode === "quote" ? "Đã chèn báo giá vào khung soạn tin" : "Đã chèn thông tin thẻ vào khung soạn tin");
  }

  async function copy(p: InboxProduct, mode: "info" | "quote") {
    const text = textFor(p, mode);
    if (!text) return;
    if (await copyToClipboard(text)) {
      setManualText(null);
      toast.success("Đã sao chép — dán vào khung chat");
    } else {
      setManualText(text);
      toast.info("Trình duyệt chặn sao chép tự động — hãy bấm giữ vào khung bên dưới để sao chép");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border/70 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SKU hoặc tên thẻ bài..."
            className="h-10 rounded-2xl border-border/80 bg-input pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={withImage}
            onChange={(e) => setWithImage(e.target.checked)}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          Kèm hình ảnh (nếu có link https)
        </label>
      </div>

      <div className="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {manualText && (
          <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2">
            <textarea
              readOnly
              autoFocus
              value={manualText}
              rows={5}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full resize-none rounded-lg border border-border/60 bg-background p-2 text-xs"
            />
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setManualText(null)}>
              Đóng
            </Button>
          </div>
        )}
        {query.trim().length < 2 && (
          <p className="py-6 text-center text-xs text-muted-foreground">Gõ ít nhất 2 ký tự để tìm trong kho.</p>
        )}
        {loading && <p className="text-center text-xs text-muted-foreground">Đang tìm...</p>}
        {!loading && query.trim().length >= 2 && rows.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">Không thấy sản phẩm phù hợp.</p>
        )}
        {rows.map((p) => {
          const price = priceOf(p);
          return (
            <div
              key={`${p.kind}-${p.id}`}
              className="space-y-2 rounded-2xl border border-border/70 bg-background/40 p-3 text-sm transition-colors duration-150 hover:border-primary/40"
            >
              <div className="flex gap-2.5">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-16 w-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] text-muted-foreground">
                    No img
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium leading-snug">{p.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {p.sku}
                    {p.detail ? ` · ${p.detail}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={p.quantity > 0 ? "success" : "secondary"}>{availabilityLabel(p)}</Badge>
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 rounded-xl bg-input/70 px-2.5 py-2 text-[11px]">
                <div>
                  <dt className="text-muted-foreground">Giá vốn (riêng tư)</dt>
                  <dd className="font-semibold tabular-nums">{p.costPrice != null ? formatVND(p.costPrice) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Giá thị trường US</dt>
                  <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {p.marketPrice != null ? formatVND(p.marketPrice) : "—"}
                  </dd>
                </div>
              </dl>

              <Input
                type="number"
                min={0}
                step="1000"
                value={prices[p.id] ?? (p.marketPrice != null ? String(Math.round(p.marketPrice)) : "")}
                onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="Giá báo cho khách (₫)"
                className="h-9 rounded-xl bg-input text-xs"
                aria-label="Giá báo cho khách"
              />

              <Button
                type="button"
                size="sm"
                className="h-9 w-full rounded-xl bg-brand-gradient text-xs text-white shadow-md shadow-primary/25 hover:opacity-95"
                disabled={!conversationId || price == null}
                onClick={() => insert(p, "quote")}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Gửi báo giá vào Chat
              </Button>
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-1 text-[11px]"
                  disabled={!conversationId}
                  onClick={() => insert(p, "info")}
                >
                  Chèn thông tin
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-1 text-[11px]" onClick={() => copy(p, "info")}>
                  <Copy className="h-3 w-3" />
                  Chép info
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-1 text-[11px]"
                  disabled={price == null}
                  onClick={() => copy(p, "quote")}
                >
                  <Copy className="h-3 w-3" />
                  Chép giá
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
