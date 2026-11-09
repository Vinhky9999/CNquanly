"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Loader2, NotebookPen, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLE =
  "Ví dụ:\n- Mục tiêu quý này: lãi ròng 30 triệu/tháng, giữ tiền mặt tối thiểu 20 triệu.\n- Hàng nhập từ Mỹ qua trung gian, tỷ giá mình theo dõi ~25.800đ/USD.\n- Set One Piece mới ra cuối tháng sau, định gom thêm hàng trước đó.\n- Không muốn vay thêm; chỉ chấp nhận công nợ phải thu dưới 30 ngày.";

const LESSON_EXAMPLE = "Ví dụ: Khi tôi hỏi “hàng nên bán” thì xếp theo % lãi dự kiến, chỉ lấy hàng tồn từ 2 trở lên.";

interface Lesson {
  id: string;
  content: string;
  createdAt: string;
}

// The assistant's memory: (1) the owner's context and goals, one free-text note; (2) the short rules the owner has taught it
// ("hãy nhớ…"), which the assistant can also add itself when asked in chat. Everything is stored in the database and added
// to the assistant's instructions, so deep analyses, plans and later answers take it into account.
export function ContextDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState("context");

  // --- context note ---
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [maxChars, setMaxChars] = useState(4000);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // --- lessons ---
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonLimits, setLessonLimits] = useState({ maxChars: 400, maxCount: 30 });
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsFailed, setLessonsFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [teaching, setTeaching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const applyLessons = useCallback((j: { lessons?: Lesson[]; maxChars?: number; maxCount?: number }) => {
    setLessons(j.lessons ?? []);
    setLessonLimits((l) => ({ maxChars: j.maxChars ?? l.maxChars, maxCount: j.maxCount ?? l.maxCount }));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setLessonsLoading(true);
    setLessonsFailed(false);
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
    fetch("/api/ai/lessons")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((j) => !cancelled && applyLessons(j))
      .catch(() => !cancelled && setLessonsFailed(true))
      .finally(() => !cancelled && setLessonsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, applyLessons]);

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

  async function teach() {
    const text = draft.trim();
    if (!text || teaching) return;
    setTeaching(true);
    try {
      const res = await fetch("/api/ai/lessons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Không lưu được bài học");
      applyLessons(json);
      setDraft("");
      toast.success(json.duplicate ? "Trợ lý đã nhớ điều này rồi" : "Trợ lý đã ghi nhớ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được bài học");
    } finally {
      setTeaching(false);
    }
  }

  async function forget(lesson: Lesson) {
    setBusyId(lesson.id);
    try {
      const res = await fetch(`/api/ai/lessons?id=${encodeURIComponent(lesson.id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Không xoá được bài học");
      applyLessons(json);
      toast.success("Đã xoá bài học");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không xoá được bài học");
    } finally {
      setBusyId(null);
    }
  }

  const dirty = content.trim() !== saved.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4" />
            Bộ nhớ của trợ lý
          </DialogTitle>
          <DialogDescription>Những gì trợ lý nhớ về shop của bạn. Nó được thêm vào mọi câu trả lời; phân tích sâu dùng nó để lập kế hoạch.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="context">Bối cảnh &amp; mục tiêu</TabsTrigger>
            <TabsTrigger value="lessons">Đã học{lessons.length > 0 ? ` (${lessons.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="context" className="space-y-3">
            <p className="text-xs text-muted-foreground">Điều trợ lý không tự thấy trong số liệu: mục tiêu, tỷ giá, thuế, ngày ra set mới, giới hạn vốn…</p>
            {failed ? (
              <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">Không đọc được ghi chú. Đóng rồi mở lại để thử lại.</p>
            ) : (
              <div className="space-y-1.5">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={loading}
                  rows={8}
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
          </TabsContent>

          <TabsContent value="lessons" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Quy tắc bạn đã dạy. Dạy ở đây hoặc ngay trong chat (“Hãy nhớ: …”, “Từ giờ khi tôi hỏi … thì …”); nói “quên bài học số 2” để xoá.
            </p>

            <div className="flex items-start gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void teach();
                  }
                }}
                maxLength={lessonLimits.maxChars}
                placeholder={LESSON_EXAMPLE}
                aria-label="Điều muốn dạy trợ lý"
                disabled={teaching || lessonsFailed}
              />
              <Button type="button" onClick={teach} disabled={teaching || !draft.trim() || lessonsFailed} className="shrink-0">
                {teaching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
                Dạy
              </Button>
            </div>

            {lessonsFailed ? (
              <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">Không đọc được danh sách bài học. Đóng rồi mở lại để thử lại.</p>
            ) : lessonsLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải…
              </p>
            ) : lessons.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">Trợ lý chưa học điều gì. Hãy dạy câu đầu tiên ở ô trên.</p>
            ) : (
              <ol className="thin-scroll max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {lessons.map((l, i) => (
                  <li key={l.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
                    <span className="mt-px w-5 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1 break-words">{l.content}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => forget(l)}
                      disabled={busyId === l.id}
                      title="Xoá bài học này"
                      aria-label={`Xoá bài học số ${i + 1}`}
                    >
                      {busyId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {lessons.length}/{lessonLimits.maxCount} bài học
              </span>
              <span>
                {draft.length}/{lessonLimits.maxChars}
              </span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
