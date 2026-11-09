"use client";

import { useCallback, useEffect, useState } from "react";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Lookups the assistant used for this answer. */
  tools?: string[];
  warning?: string;
  error?: boolean;
}

export interface AssistantStatus {
  mode: "claude" | "basic";
  model: string | null;
}

const STORAGE_KEY = "cn_ai_chat_v1";
const MAX_STORED = 40;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Conversation with the assistant. It lives in sessionStorage so the floating widget and the full page share it while
 * the tab stays open, and it is gone when the tab closes (nothing about the shop's data is kept in the browser longer).
 */
export function useAssistantChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  // Saving is skipped until the stored conversation has been loaded, or the empty initial state would overwrite it.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw) as UiMessage[]);
    } catch {
      // Storage unavailable (private mode): the chat simply starts empty.
    }
    setHydrated(true);
    fetch("/api/ai/chat")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setStatus(j))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // ignore
    }
  }, [messages, hydrated]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || loading) return;
      const userMessage: UiMessage = { id: newId(), role: "user", content };
      const history = [...messages, userMessage];
      setMessages(history);
      setLoading(true);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Failed answers are not sent back as context.
          body: JSON.stringify({ messages: history.filter((m) => !m.error).slice(-20).map((m) => ({ role: m.role, content: m.content })) }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.reply) throw new Error(json?.error ?? "Trợ lý không phản hồi. Thử lại sau.");
        setStatus((s) => ({ mode: json.mode, model: s?.model ?? null }));
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: json.reply, tools: json.tools, warning: json.warning }]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", content: err instanceof Error ? err.message : "Có lỗi xảy ra, thử lại sau.", error: true },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, loading, status, send, clear };
}
