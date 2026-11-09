"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Loader2, Send, Sparkles, Trash2, User } from "lucide-react";

import { Markdown } from "@/components/assistant/markdown";
import { useAssistantChat } from "@/components/assistant/use-assistant-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Tổng kết doanh thu hôm nay thế nào?",
  "Tiền mặt và tổng giá trị danh mục hiện tại?",
  "Công nợ phải thu / phải trả?",
  "Lợi nhuận tháng này?",
  "Giao dịch gần đây",
  "Các đơn chấm điểm đang xử lý",
];

const TOOL_LABEL: Record<string, string> = {
  get_business_overview: "Tổng quan",
  get_period_report: "Báo cáo kỳ",
  search_inventory: "Kho",
  lookup_customer: "Khách hàng",
  list_debts: "Công nợ",
  list_recent_transactions: "Dòng tiền",
  get_grading_status: "Chấm điểm",
};

// Chat with the store assistant (full page and the floating widget share this component and the same conversation).
export function AssistantChat({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { messages, loading, status, send, clear } = useAssistantChat();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function submit(text = draft) {
    if (!text.trim() || loading) return;
    setDraft("");
    void send(text);
  }

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/30">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Trợ Lý Quản Lý CardNest</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {status
                ? status.mode === "claude"
                  ? `Claude AI${status.model ? ` · ${status.model}` : ""}`
                  : "Chế độ cơ bản · tra cứu theo từ khoá"
                : "Đang kết nối…"}
            </p>
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={clear} disabled={messages.length === 0 || loading} title="Xoá cuộc trò chuyện" aria-label="Xoá cuộc trò chuyện">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4 text-sm">
              <p className="font-semibold">Xin chào! 👋</p>
              <p className="mt-1 text-muted-foreground">
                Mình tra cứu số liệu thật của cửa hàng: kho, doanh thu, dòng tiền, công nợ, khách hàng và chấm điểm. Mình chỉ đọc dữ liệu, không tự sửa hay tạo giao dịch.
              </p>
              {status?.mode === "basic" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Đang ở chế độ cơ bản (trả lời theo từ khoá). Đặt <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> để dùng Claude hiểu câu hỏi tự nhiên hơn.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  disabled={loading}
                  className="rounded-full border border-border/80 bg-input px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/60 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-primary/20 text-accent-foreground" : "bg-brand-soft text-accent-foreground"
              )}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div className={cn("min-w-0 max-w-[88%] space-y-1.5", m.role === "user" && "flex flex-col items-end")}>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5",
                  m.role === "user"
                    ? "rounded-tr-md bg-brand-gradient text-sm text-white shadow-md shadow-primary/20"
                    : m.error
                      ? "rounded-tl-md border border-danger/40 bg-danger/10 text-sm text-danger"
                      : "rounded-tl-md border border-border/60 bg-secondary text-secondary-foreground"
                )}
              >
                {m.role === "user" ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : m.error ? <p>{m.content}</p> : <Markdown text={m.content} />}
              </div>
              {m.warning && (
                <p className="flex items-center gap-1 text-[11px] text-warning">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {m.warning} Đang trả lời bằng chế độ cơ bản.
                </p>
              )}
              {m.tools && m.tools.length > 0 && (
                <p className="text-[10px] text-muted-foreground">Đã tra cứu: {m.tools.map((t) => TOOL_LABEL[t] ?? t).join(" · ")}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground" role="status">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-accent-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
            Đang tra cứu dữ liệu…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border/70 bg-background/40 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-input p-2 transition-colors focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-ring/30">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={compact ? 1 : 2}
            maxLength={4000}
            placeholder="Hỏi về kho, doanh thu, công nợ, khách hàng…"
            aria-label="Câu hỏi cho trợ lý"
            className="thin-scroll max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="button"
            onClick={() => submit()}
            disabled={loading || !draft.trim()}
            className="h-10 w-10 shrink-0 rounded-xl bg-brand-gradient p-0 text-white shadow-md shadow-primary/30 hover:opacity-95 disabled:opacity-50"
            aria-label="Gửi câu hỏi"
            title="Gửi (Enter)"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Enter để gửi · Shift + Enter xuống dòng</p>
      </div>
    </div>
  );
}
