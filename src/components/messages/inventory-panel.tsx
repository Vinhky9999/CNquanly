"use client";

import { useEffect, useState } from "react";
import { Copy, PackageSearch, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { availabilityLabel, infoMessage, quoteMessage, type InboxProduct } from "@/lib/inbox-quote";
import { formatVND } from "@/lib/utils";
import { sendMessageAction } from "@/server/actions/messenger";

interface InventoryPanelProps {
  /** Null when no conversation is open: the panel can still be searched but not sent from. */
  conversationId: string | null;
  onSent: () => void;
}

const isHttps = (url: string | null) => Boolean(url && /^https:\/\//i.test(url));

// Compact inventory lookup beside the chat: search a SKU / name, then send the card's info or a price
// quote straight into the conversation instead of copying it by hand.
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

export function InventoryPanel({ conversationId, onSent }: InventoryPanelProps) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InboxProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [withImage, setWithImage] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  // No Meta connection needed: copy the text and paste it into any chat (Messenger, Zalo, Business Suite...).
  async function copy(p: InboxProduct, mode: "info" | "quote") {
    const price = priceOf(p);
    if (mode === "quote" && price == null) return toast.error("Nhập giá báo cho khách");
    const text = mode === "quote" ? quoteMessage(p, price!) : infoMessage(p);
    if (await copyToClipboard(text)) {
      setManualText(null);
      toast.success(mode === "quote" ? "Đã sao chép báo giá — dán vào khung chat" : "Đã sao chép thông tin thẻ");
    } else {
      setManualText(text);
      toast.info("Trình duyệt chặn sao chép tự động — hãy bấm giữ vào khung bên dưới để sao chép");
    }
  }

  async function send(p: InboxProduct, mode: "info" | "quote") {
    if (!conversationId) return toast.error("Hãy chọn một hội thoại trước");
    const price = priceOf(p);
    if (mode === "quote" && price == null) return toast.error("Nhập giá báo cho khách");

    setBusyId(`${p.id}:${mode}`);
    const text = mode === "quote" ? quoteMessage(p, price!) : infoMessage(p);
    const result = await sendMessageAction(conversationId, {
      text,
      imageUrl: withImage && isHttps(p.imageUrl) ? p.imageUrl! : undefined,
    });
    setBusyId(null);

    if (result.error) return toast.error(result.error);
    if (result.status === "FAILED") toast.error(result.warning ?? "Gửi lỗi");
    else toast.success(mode === "quote" ? "Đã gửi báo giá" : "Đã gửi thông tin thẻ");
    onSent();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border/60 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <PackageSearch className="h-3.5 w-3.5" />
          Tra cứu kho
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SKU hoặc tên sản phẩm..."
            className="h-9 pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={withImage}
            onChange={(e) => setWithImage(e.target.checked)}
            className="h-3.5 w-3.5 accent-indigo-500"
          />
          Kèm hình ảnh khi gửi vào chat (nếu có link https)
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
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
            <div key={`${p.kind}-${p.id}`} className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-2.5 text-sm dark:bg-slate-900/40">
              <div className="flex gap-2">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-14 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] text-muted-foreground">
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
                    {p.marketPrice != null && (
                      <span className="text-[11px] text-muted-foreground">Thị trường {formatVND(p.marketPrice)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step="1000"
                  value={prices[p.id] ?? (p.marketPrice != null ? String(Math.round(p.marketPrice)) : "")}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="Giá báo (₫)"
                  className="h-8 text-xs"
                  aria-label="Giá báo cho khách"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => copy(p, "info")}>
                  <Copy className="h-3 w-3" />
                  Sao chép thông tin
                </Button>
                <Button type="button" size="sm" className="h-8 text-xs" disabled={price == null} onClick={() => copy(p, "quote")}>
                  <Copy className="h-3 w-3" />
                  Sao chép báo giá
                </Button>
              </div>
              {conversationId && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    disabled={busyId === `${p.id}:info`}
                    onClick={() => send(p, "info")}
                  >
                    Gửi vào chat
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    disabled={price == null || busyId === `${p.id}:quote`}
                    onClick={() => send(p, "quote")}
                  >
                    Gửi báo giá vào chat
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
