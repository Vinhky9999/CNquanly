"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ImageIcon, Loader2, Pencil, PanelRight, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

const clock = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Hôm nay";
  if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
  return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
};

const GROUP_GAP_MS = 5 * 60 * 1000;

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
  /** Opens the customer profile drawer (shown below the xl breakpoint). */
  onOpenProfile?: () => void;
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
  onOpenProfile,
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

  // Consecutive messages from the same side within a few minutes read as one visual group.
  const grouped = useMemo(
    () =>
      messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const close = (a?: Message, b?: Message) =>
          Boolean(a && b && a.direction === b.direction && Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_GAP_MS);
        return {
          m,
          startsGroup: !close(prev, m),
          endsGroup: !close(m, next),
          newDay: !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString(),
        };
      }),
    [messages]
  );

  const label = labelOf(meta.label);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Fixed header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {conversation?.profilePic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={conversation.profilePic} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
              {(conversation?.customerName ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            {conversation ? (
              <p className="truncate font-semibold leading-tight">{conversation.customerName}</p>
            ) : (
              <Skeleton className="h-4 w-32" />
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
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
        <div className="flex shrink-0 items-center gap-1">
          {onOpenProfile && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-xl min-[1360px]:hidden"
              title="Hồ sơ khách & tra cứu kho"
              aria-label="Mở hồ sơ khách và tra cứu kho"
              onClick={onOpenProfile}
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            title="Xoá hội thoại"
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

      {/* Only this area scrolls */}
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {!conversation && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
            <Skeleton className="h-9 w-1/3 rounded-2xl" />
          </div>
        )}
        {conversation && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Chưa có tin nhắn trong hội thoại này.</p>
        )}
        {grouped.map(({ m, startsGroup, endsGroup, newDay }) => {
          const mine = m.direction === "OUT";
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="h-px flex-1 bg-border/60" />
                  {dayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-border/60" />
                </div>
              )}
              <div className={cn("flex", mine ? "justify-end" : "justify-start", startsGroup ? "mt-3" : "mt-0.5")}>
                <div className={cn("flex max-w-[82%] flex-col sm:max-w-[72%]", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "min-w-0 max-w-full whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                      mine
                        ? "rounded-[18px] bg-brand-gradient text-white shadow-primary/20"
                        : "rounded-[18px] border border-border/60 bg-secondary text-secondary-foreground",
                      mine ? (startsGroup ? "rounded-br-md" : "rounded-r-md") : startsGroup ? "rounded-bl-md" : "rounded-l-md"
                    )}
                  >
                    {m.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.imageUrl} alt="Hình ảnh trong tin nhắn" className="mb-1 max-h-64 w-auto max-w-full rounded-xl object-contain" />
                    )}
                    {m.text}
                    {!m.text && !m.imageUrl && <ImageIcon className="h-4 w-4" />}
                  </div>
                  {(endsGroup || m.status !== "SENT") && (
                    <p className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
                      {clock(m.createdAt)}
                      {m.status === "LOCAL" && <span className="text-amber-500">· chỉ lưu nội bộ</span>}
                      {m.status === "FAILED" && (
                        <span className="inline-flex items-center gap-0.5 text-rose-400" title={m.error ?? undefined}>
                          <AlertTriangle className="h-3 w-3" />
                          gửi lỗi{m.error ? `: ${m.error}` : ""}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer stays at the bottom */}
      <div className="shrink-0 border-t border-border/70 bg-background/40">
        <div className="thin-scroll flex items-center gap-1.5 overflow-x-auto px-3 pb-1 pt-3">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.content)}
              title={t.content}
              className="shrink-0 whitespace-nowrap rounded-full border border-border/80 bg-input px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-primary/60 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.emoji} {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onEditTemplates}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3 w-3" />
            Sửa mẫu
          </button>
        </div>

        {attachment && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl border border-border/70 bg-input p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment} alt="Ảnh đính kèm" className="h-12 w-9 rounded-md object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Ảnh sẽ được gửi kèm tin nhắn</span>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAttachment(null)} title="Bỏ ảnh đính kèm" aria-label="Bỏ ảnh đính kèm">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-input p-2 transition-colors focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-ring/30">
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
              placeholder="Nhập tin nhắn…"
              aria-label="Nội dung tin nhắn"
              rows={2}
              className="thin-scroll max-h-40 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              type="button"
              className="h-10 w-10 shrink-0 rounded-xl bg-brand-gradient p-0 text-white shadow-md shadow-primary/30 transition-transform hover:scale-105 hover:opacity-95 disabled:opacity-50 disabled:hover:scale-100"
              disabled={sending || (!draft.trim() && !attachment)}
              onClick={send}
              title="Gửi (Enter)"
              aria-label="Gửi tin nhắn"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">Enter để gửi · Shift + Enter để xuống dòng</p>
        </div>
      </div>
    </div>
  );
}
