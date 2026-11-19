"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardPaste, Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BOOKMARKLET_HREF } from "@/lib/ebay/bookmarklet";
import { looksLikePageSource, parseEbayPage, unwrapClipboardText, type PageDocument, type PageParseResult } from "@/lib/ebay/page";
import { isEbayHost } from "@/lib/ebay/url";

export type ImportedPage = Extract<PageParseResult, { ok: true }> & { capturedAt: Date | null };

const parseDom = (html: string) => new DOMParser().parseFromString(html, "text/html") as unknown as PageDocument;

// Reads an eBay listing page that the owner opened in his own browser. eBay does not let software fetch its pages (its servers
// refuse with HTTP 403 and its terms forbid it), so the page comes from the person who is allowed to look at it: either the
// bookmark button copies it, or the owner copies the page source (Ctrl+U, Ctrl+A, Ctrl+C). The page is read right here in the
// browser; it is never sent to the server. Only the fields that were read are saved, after the owner has checked them.
export function EbayPageImport({
  openUrl,
  expectedItemId,
  onParsed,
  title = "Đọc thông tin từ trang eBay (không cần khoá API)",
}: {
  /** The eBay link to open in a new tab, when there is one. */
  openUrl: string | null;
  /** When set, only the page of this listing is accepted (updating a card that already exists). */
  expectedItemId?: string | null;
  onParsed: (page: ImportedPage) => void;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ kind: string; text: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  // The parent re-renders often; the reader should not re-subscribe to paste events each time.
  const latest = useRef({ onParsed, expectedItemId });
  latest.current = { onParsed, expectedItemId };

  // The bookmark address is a javascript: link: it is set on the element directly because React does not render those.
  useEffect(() => {
    bookmarkRef.current?.setAttribute("href", BOOKMARKLET_HREF);
  }, []);

  const handleText = useCallback(
    async (raw: string) => {
      if (!raw.trim()) return;
      setError(null);
      if (!looksLikePageSource(raw)) {
        setError({ kind: "NOT_PAGE", text: "Nội dung vừa dán không phải mã nguồn trang eBay. Hãy dùng nút dấu trang hoặc mở trang sản phẩm rồi nhấn Ctrl+U, Ctrl+A, Ctrl+C." });
        return;
      }
      setBusy(true);
      try {
        // Let the "reading" state paint first: a big page takes a moment to parse.
        await new Promise((resolve) => setTimeout(resolve, 30));
        const { html, url, capturedAt } = unwrapClipboardText(raw);
        if (url) {
          let host = "";
          try {
            host = new URL(url).hostname;
          } catch {
            /* an unreadable link is treated like a missing one */
          }
          if (host && !isEbayHost(host)) {
            setError({ kind: "NOT_EBAY", text: "Trang vừa sao chép không phải của eBay. Hãy mở trang sản phẩm eBay rồi sao chép lại." });
            return;
          }
        }
        const result = parseEbayPage(html, { parseDom, capturedAt, url, expectedItemId: latest.current.expectedItemId ?? null });
        if (!result.ok) {
          setError({ kind: result.kind, text: result.error });
          return;
        }
        if (areaRef.current) areaRef.current.value = "";
        latest.current.onParsed({ ...result, capturedAt });
      } catch {
        setError({ kind: "PARSE", text: "Không đọc được nội dung này. Hãy mở lại trang sản phẩm, đợi trang tải xong rồi sao chép lại." });
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // Ctrl+V while this panel is open reads the page that was just copied, wherever the cursor is (it may well still be in the link
  // box, where a whole page would be useless). Only text that is page source or the bookmark button's output is taken; any other
  // paste is left alone. The text box below handles its own paste, so it must not be read twice.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikePageSource(text)) return;
      event.preventDefault();
      void handleText(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleText]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError({ kind: "EMPTY", text: "Clipboard đang trống. Hãy sao chép trang eBay trước (nút dấu trang, hoặc Ctrl+U rồi Ctrl+A, Ctrl+C)." });
        return;
      }
      await handleText(text);
    } catch {
      setError({ kind: "CLIPBOARD", text: "Trình duyệt không cho đọc clipboard. Hãy nhấn Ctrl+V trong ô bên dưới." });
      areaRef.current?.focus();
    }
  }

  async function copyBookmark() {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_HREF);
      toast.success("Đã sao chép mã nút dấu trang");
    } catch {
      toast.error("Không sao chép được. Hãy kéo nút lên thanh dấu trang.");
    }
  }

  const blocked = error?.kind === "BLOCKED";

  return (
    <section className="space-y-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-3" aria-label="Đọc từ trang eBay">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          eBay không cho phần mềm tự đọc trang của họ, nên trang được lấy từ chính trình duyệt của bạn. Trang chỉ được đọc ngay trên máy bạn, không gửi lên máy chủ; chỉ các trường đọc được mới được lưu, sau khi bạn kiểm tra.
        </p>
      </div>

      <ol className="space-y-2 text-sm">
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-medium">1.</span>
          {openUrl ? (
            <Button asChild type="button" variant="outline" size="sm">
              <a href={openUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Mở trang eBay
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled title="Dán link eBay vào ô phía trên trước">
              <ExternalLink className="h-4 w-4" />
              Mở trang eBay
            </Button>
          )}
          <span className="text-muted-foreground">{openUrl ? "(mở ở tab mới, đợi trang tải xong)" : "(dán link eBay vào ô phía trên, hoặc tự mở trang sản phẩm)"}</span>
        </li>
        <li>
          <span className="font-medium">2.</span> Trên trang eBay: bấm dấu trang <b>“Lấy sang CardNest”</b> (cài một lần, xem bên dưới). Không cài thì nhấn <kbd className="rounded border px-1 text-xs">Ctrl+U</kbd>, rồi{" "}
          <kbd className="rounded border px-1 text-xs">Ctrl+A</kbd>, <kbd className="rounded border px-1 text-xs">Ctrl+C</kbd>.
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <span className="font-medium">3.</span> Quay lại đây và nhấn <kbd className="rounded border px-1 text-xs">Ctrl+V</kbd> hoặc
          <Button type="button" size="sm" onClick={pasteFromClipboard} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
            Dán từ clipboard
          </Button>
        </li>
      </ol>

      <Textarea
        ref={areaRef}
        rows={2}
        spellCheck={false}
        aria-label="Dán mã nguồn trang eBay"
        placeholder="Hoặc dán mã nguồn trang vào đây (Ctrl+V)…"
        className="font-mono text-xs"
        onPaste={(event) => {
          event.preventDefault();
          void handleText(event.clipboardData.getData("text/plain"));
        }}
        onChange={(event) => {
          // Typing is not a way in: only pasting is read. The box stays empty.
          event.target.value = "";
        }}
      />

      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang đọc trang…
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {error.text}
            {blocked && " Nếu eBay hiện CAPTCHA, bạn tự xác minh trên trình duyệt của mình; phần mềm này không vượt CAPTCHA hay cơ chế chống bot."}
          </span>
        </p>
      )}

      <details className="rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none font-medium">Cài nút “Lấy sang CardNest” lên thanh dấu trang (làm một lần, tuỳ chọn)</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            Hiện thanh dấu trang: <kbd className="rounded border px-1 text-xs">Ctrl+Shift+B</kbd> (Chrome, Edge, Firefox).
          </li>
          <li>
            Dùng chuột kéo nút này lên thanh dấu trang:{" "}
            <a
              ref={bookmarkRef}
              href="#"
              draggable
              onClick={(event) => {
                // Clicking it here would run it on this page: it only makes sense on an eBay page.
                event.preventDefault();
                toast.info("Hãy kéo nút này lên thanh dấu trang, rồi bấm nó khi đang mở trang sản phẩm eBay.");
              }}
              className="inline-flex cursor-grab items-center gap-1 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary active:cursor-grabbing"
            >
              Lấy sang CardNest
            </a>
          </li>
          <li>
            Không kéo được? Bấm
            <Button type="button" size="sm" variant="outline" className="mx-1 h-7" onClick={copyBookmark}>
              <Copy className="h-3.5 w-3.5" />
              Sao chép mã nút
            </Button>
            rồi tạo dấu trang mới (<kbd className="rounded border px-1 text-xs">Ctrl+D</kbd>), đặt tên “Lấy sang CardNest” và dán mã vào ô địa chỉ (URL) của dấu trang.
          </li>
          <li>Khi đang mở trang sản phẩm eBay, bấm dấu trang đó. Thấy thông báo “Đã sao chép trang eBay” thì quay lại đây nhấn Ctrl+V.</li>
          <li>Trên điện thoại không dùng được cách này: hãy nhập tay hoặc dùng máy tính.</li>
        </ol>
      </details>
    </section>
  );
}
