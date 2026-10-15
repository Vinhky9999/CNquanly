"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ImageIcon, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteConversationAction,
  markConversationReadAction,
  sendMessageAction,
} from "@/server/actions/messenger";
import { fillTemplate, GRADING_BADGE, labelOf, type TemplateVars } from "@/lib/messenger-labels";
import { cn } from "@/lib/utils";

export interface Conversation {
  id: string;
  psid: string;
  customerName: string;
  profilePic: string | null;
  lastMessageText: string | null;
  lastMessageAt: string;
  unreadCount: number;
  label: string | null;
  hasGrading: boolean;
}

export interface Template {
  id: string;
  label: string;
  emoji: string;
  content: string;
}

/** Text (and optionally a picture) the inventory panel wants placed in the composer. */
export interface InsertRequest {
  nonce: number;
  text: string;
  imageUrl?: string;
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
  /** Bumped by the parent after something changed the history, to reload right away. */
  refreshToken: number;
  onChanged: () => void;
  onDeleted: () => void;
  templates: Template[];
  onEditTemplates: () => void;
  templateVars: TemplateVars;
  insert: InsertRequest | null;
  /** Label / grading flags of this conversation as the list knows them (kept fresh by the parent). */
  meta: { label: string | null; hasGrading: boolean };
}

export function ChatPanel({
  conversationId,
  refreshToken,
  onChanged,
  onDeleted,
  templates,
  onEditTemplates,
  templateVars,
  insert,
  meta,
}: ChatPanelProps) {
  const [conversation, setConversation] = useState<Pick<Conversation, "customerName" | "profilePic" | "unreadCount"> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastCount = useRef(0);
  const lastInsert = useRef(insert?.nonce ?? 0);

  // Parent callbacks change identity whenever its filter / search changes; keep the polling and the
  // draft independent of that by reading them through refs.
  const onChangedRef = useRef(onChanged);
  const onDeletedRef = useRef(onDeleted);
  useEffect(() => {
    onChangedRef.current = onChanged;
    onDeletedRef.current = onDeleted;
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/messenger/conversations/${conversationId}`).catch(() => null);
    if (res?.status === 404) return onDeletedRef.current(); // deleted elsewhere: stop polling it
    if (!res?.ok) return;
    const json = await res.json();
    setConversation(json.conversation);
    setMessages(json.messages);
    if (json.conversation.unreadCount > 0) {
      await markConversationReadAction(conversationId);
      onChangedRef.current();
    }
  }, [conversationId]);

  // A different conversation starts with an empty composer.
  useEffect(() => {
    lastCount.current = 0;
    setMessages([]);
    setConversation(null);
    setDraft("");
    setAttachment(null);
  }, [conversationId]);

  useEffect(() => {
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

  // A quote from the inventory panel lands in the composer (after what is already typed), never sent blindly.
  useEffect(() => {
    if (!insert || insert.nonce === lastInsert.current) return;
    lastInsert.current = insert.nonce;
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${insert.text}` : insert.text));
    if (insert.imageUrl) setAttachment(insert.imageUrl);
    composerRef.current?.focus();
  }, [insert]);

  function applyTemplate(content: string) {
    const text = fillTemplate(content, templateVars);
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    composerRef.current?.focus();
  }

  async function send() {
    const text = draft.trim();
    if ((!text && !attachment) || sending) return;
    setSending(true);
    const result = await sendMessageAction(conversationId, { text, imageUrl: attachment ?? undefined });
    setSending(false);
    if (result.error) return toast.error(result.error);
    setDraft("");
    setAttachment(null);
    if (result.status === "FAILED") toast.error(result.warning ?? "Meta từ chối tin nhắn");
    else if (result.warning) toast.info(result.warning);
    await load();
    onChangedRef.current();
  }

  const label = labelOf(meta.label);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 dark:border-slate-800/80">
        <div className="flex min-w-0 items-center gap-3">
          {conversation?.profilePic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={conversation.profilePic} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
              {(conversation?.customerName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{conversation?.customerName ?? "…"}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Facebook Messenger</span>
              {label && (
                <Badge variant={label.variant}>
                  {label.emoji} {label.label}
                </Badge>
              )}
              {meta.hasGrading && (
                <Badge variant="indigo">
                  {GRADING_BADGE.emoji} {GRADING_BADGE.label}
                </Badge>
              )}
            </div>
          </div>
        </div>
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

      <div className="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
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
                      : "rounded-bl-md border-border/60 bg-card dark:border-slate-800/80 dark:bg-slate-800/70"
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

      <div className="border-t border-border/60 dark:border-slate-800/80">
        {/* Quick replies: one click fills the composer */}
        <div className="thin-scroll flex items-center gap-1.5 overflow-x-auto px-3 pb-1 pt-2.5">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.content)}
              title={t.content}
              className="shrink-0 whitespace-nowrap rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/10 dark:border-slate-700/80 dark:hover:border-indigo-400/60"
            >
              {t.emoji} {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onEditTemplates}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            Sửa mẫu
          </button>
        </div>

        {attachment && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-border/60 p-1.5 dark:border-slate-800/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment} alt="Ảnh đính kèm" className="h-12 w-9 rounded-md object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Ảnh sẽ được gửi kèm tin nhắn</span>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAttachment(null)} aria-label="Bỏ ảnh đính kèm">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2 p-3">
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
            rows={3}
            className="thin-scroll max-h-40 min-h-[44px] resize-none"
          />
          <Button type="button" className="h-10" disabled={sending || (!draft.trim() && !attachment)} onClick={send}>
            <Send className="h-4 w-4" />
            Gửi
          </Button>
        </div>
      </div>
    </div>
  );
}
