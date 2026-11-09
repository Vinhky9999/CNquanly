"use client";

import { useEffect, useState } from "react";
import { Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLE =
  "Ví dụ:\n- Mục tiêu quý này: lãi ròng 30 triệu/tháng, giữ tiền mặt tối thiểu 20 triệu.\n- Hàng nhập từ Mỹ qua trung gian, tỷ giá mình theo dõi ~25.800đ/USD.\n- Set One Piece mới ra cuối tháng sau, định gom thêm hàng trước đó.\n- Không muốn vay thêm; chỉ chấp nhận công nợ phải thu dưới 30 ngày.";

// The owner's own context for the analyst (goals, exchange rate he follows, upcoming releases, limits). It is stored in
// the database and added to the assistant's instructions, so deep analyses and plans take it into account.
export function ContextDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [maxChars, setMaxChars] = useState(4000);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch("/api/ai/context")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((j) => {
        if (cancelled) return;
        setContent(j.content ?? "");
        setSaved(j.content ?? "");
        setUpdatedAt(j.updatedAt ?? null);
        if (typeof j.maxChars === "number") setMaxChars(j.maxChars);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Không lưu được ghi chú");
      setContent(json.content ?? "");
      setSaved(json.content ?? "");
      setUpdatedAt(json.updatedAt ?? null);
      toast.success("Đã lưu bối cảnh cho trợ lý");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được ghi chú");
    } finally {
      setSaving(false);
    }
  }

  const dirty = content.trim() !== saved.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4" />
            Bối cảnh &amp; mục tiêu của shop
          </DialogTitle>
          <DialogDescription>
            Ghi những điều trợ lý không tự thấy được trong số liệu: mục tiêu, tỷ giá, thuế, ngày ra set mới, giới hạn vốn… Phân tích chuyên sâu sẽ dùng ghi chú này khi lập kế hoạch.
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">Không đọc được ghi chú. Đóng rồi mở lại để thử lại.</p>
        ) : (
          <div className="space-y-1.5">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={loading}
              rows={9}
              maxLength={maxChars}
              placeholder={EXAMPLE}
              aria-label="Bối cảnh và mục tiêu của shop"
              className="thin-scroll max-h-72 resize-y"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{updatedAt ? `Cập nhật lần cuối: ${new Date(updatedAt).toLocaleString("vi-VN")}` : "Chưa có ghi chú"}</span>
              <span>
                {content.length}/{maxChars}
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Đóng
          </Button>
          <Button type="button" onClick={save} disabled={saving || loading || failed || !dirty}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu ghi chú
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
