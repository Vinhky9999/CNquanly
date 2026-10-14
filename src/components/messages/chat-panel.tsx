"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ImageIcon, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteConversationAction,
  markConversationReadAction,
  sendMessageAction,
} from "@/server/actions/messenger";
import { SimulateDialog } from "@/components/messages/simulate-dialog";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: string;
  psid: string;
  customerName: string;
  profilePic: string | null;
  lastMessageText: string | null;
  lastMessageAt: string;
  unreadCount: number;
  isSimulated: boolean;
}

interface Message {
  id: string;
  direction: "IN" | "OUT";
  text: string | null;
  imageUrl: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

const time = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(
    new Date(iso)
  );

interface ChatPanelProps {
  conversationId: string;
  /** Bumped by the parent after it sent something (e.g. from the inventory sidebar). */
  refreshToken: number;
  onChanged: () => void;
  onDeleted: () => void;
}

export function ChatPanel({ conversationId, refreshToken, onChanged, onDeleted }: ChatPanelProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/messenger/conversations/${conversationId}`).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setConversation(json.conversation);
    setMessages(json.messages);
    if (json.conversation.unreadCount > 0) {
      await markConversationReadAction(conversationId);
      onChanged();
    }
  }, [conversationId, onChanged]);

  useEffect(() => {
    lastCount.current = 0;
    setMessages([]);
    setConversation(null);
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load, refreshToken]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const result = await sendMessageAction(conversationId, { text });
    setSending(false);
    if (result.error) return toast.error(result.error);
    setDraft("");
    if (result.status === "FAILED") toast.error(result.warning ?? "Meta từ chối tin nhắn");
    else if (result.warning) toast.info(result.warning);
    await load();
    onChanged();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{conversation?.customerName ?? "…"}</p>
          <p className="text-xs text-muted-foreground">
            {conversation?.isSimulated ? "Hội thoại mô phỏng" : "Facebook Messenger"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {conversation?.isSimulated && (
            <SimulateDialog conversationId={conversationId} onDone={() => load().then(onChanged)} />
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Xoá hội thoại"
            onClick={async () => {
              if (!confirm("Xoá hội thoại này khỏi hệ thống? (Không xoá trên Facebook)")) return;
              const result = await deleteConversationAction(conversationId);
              if (result.error) return toast.error(result.error);
              onDeleted();
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Chưa có tin nhắn.</p>}
        {messages.map((m) => {
          const mine = m.direction === "OUT";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className="max-w-[78%] space-y-1">
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words rounded-2xl border px-3 py-2 text-sm",
                    mine
                      ? "rounded-br-md border-indigo-500/30 bg-indigo-600 text-white dark:bg-indigo-500/80"
                      : "rounded-bl-md border-border/60 bg-card dark:bg-slate-800/70"
                  )}
                >
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="Hình ảnh" className="mb-1 max-h-56 rounded-lg object-contain" />
                  )}
                  {m.text}
                  {!m.text && !m.imageUrl && <ImageIcon className="h-4 w-4" />}
                </div>
                <p className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", mine && "justify-end")}>
                  {time(m.createdAt)}
                  {m.status === "LOCAL" && <span className="text-amber-600 dark:text-amber-400">· chỉ lưu nội bộ</span>}
                  {m.status === "FAILED" && (
                    <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400" title={m.error ?? undefined}>
                      <AlertTriangle className="h-3 w-3" />
                      gửi lỗi{m.error ? `: ${m.error}` : ""}
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border/60 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
          rows={2}
          className="min-h-[44px] resize-none"
        />
        <Button type="button" className="h-10" disabled={sending || !draft.trim()} onClick={send}>
          <Send className="h-4 w-4" />
          Gửi
        </Button>
      </div>
    </div>
  );
}
