"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Template } from "@/components/messages/chat-panel";
import { saveTemplatesAction } from "@/server/actions/messenger";

interface Draft {
  key: number;
  label: string;
  emoji: string;
  content: string;
}

let nextKey = 1;
const toDraft = (t: Pick<Template, "label" | "emoji" | "content">): Draft => ({ key: nextKey++, ...t });

export function TemplatesDialog({
  open,
  onOpenChange,
  templates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDrafts(templates.map(toDraft));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key: number, change: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...change } : d)));

  async function save() {
    setSaving(true);
    const result = await saveTemplatesAction(drafts.map(({ label, emoji, content }) => ({ label, emoji, content })));
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success("Đã lưu mẫu tin nhắn");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sửa mẫu tin nhắn nhanh</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Điền thông tin thật của shop vào các chỗ trong ngoặc (ngân hàng, địa chỉ, giá…). Có thể dùng biến:{" "}
            <code className="rounded bg-muted px-1">{"{{ten_khach}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{ma_van_don}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{don_vi_van_chuyen}}"}</code> — mã vận đơn lấy từ đơn giao hàng gần nhất
            của khách (cần liên kết khách hàng).
          </p>
          {drafts.map((d, index) => (
            <div key={d.key} className="space-y-2 rounded-2xl border border-border/60 p-3 dark:border-slate-800/80">
              <div className="flex items-end gap-2">
                <div className="w-16 space-y-1.5">
                  <Label>Icon</Label>
                  <Input value={d.emoji} onChange={(e) => patch(d.key, { emoji: e.target.value })} maxLength={4} className="text-center" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>Tên nút #{index + 1}</Label>
                  <Input value={d.label} onChange={(e) => patch(d.key, { label: e.target.value })} maxLength={40} />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Xoá mẫu"
                  onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Textarea
                value={d.content}
                onChange={(e) => patch(d.key, { content: e.target.value })}
                rows={5}
                maxLength={2000}
                className="thin-scroll text-sm"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full border-dashed"
            disabled={drafts.length >= 12}
            onClick={() => setDrafts((prev) => [...prev, toDraft({ label: "", emoji: "💬", content: "" })])}
          >
            <Plus className="h-4 w-4" />
            Thêm mẫu
          </Button>
          <Button type="button" className="w-full" disabled={saving} onClick={save}>
            {saving ? "Đang lưu..." : "Lưu các mẫu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
