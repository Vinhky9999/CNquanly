"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { History, MessageCircle, PanelRight, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatPanel, type Conversation, type InsertRequest, type Template } from "@/components/messages/chat-panel";
import { ConnectionDialog } from "@/components/messages/connection-dialog";
import type { ConversationProfile } from "@/components/messages/crm-tab";
import { RightPanel } from "@/components/messages/right-panel";
import { TemplatesDialog } from "@/components/messages/templates-dialog";
import {
  CONVERSATION_FILTERS,
  GRADING_BADGE,
  labelOf,
  type ConversationFilter,
} from "@/lib/messenger-labels";
import { syncHistoryStepAction } from "@/server/actions/messenger";
import { cn } from "@/lib/utils";

const shortTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(d);
};

// Luxury dark panels: hairline slate borders, soft glass background, equal rounding everywhere.
const PANEL =
  "rounded-2xl border border-border/60 bg-card/80 dark:border-slate-800/80 dark:bg-slate-900/50 dark:backdrop-blur-md";

export interface FbStatus {
  fb: string | null;
  msg: string | null;
  warn: string | null;
}

export function InboxWorkspace({ initialConnected, fbStatus }: { initialConnected: boolean; fbStatus: FbStatus }) {
  const router = useRouter();
  const pathname = usePathname();
  const [openPicker] = useState(fbStatus.fb === "pick");
  // Errors from the Facebook login stay on screen (a toast disappears before it can be read).
  const [banner, setBanner] = useState<{ tone: "error" | "warn"; text: string } | null>(
    fbStatus.fb === "error"
      ? { tone: "error", text: fbStatus.msg ?? "Kết nối Facebook thất bại" }
      : fbStatus.fb === "connected" && fbStatus.warn
        ? { tone: "warn", text: `Đã lưu Page nhưng: ${fbStatus.warn}` }
        : null
  );

  const [connected, setConnected] = useState(initialConnected);
  const [rows, setRows] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Right column: CRM profile / inventory lookup; below xl it opens under the chat on demand.
  const [rightTab, setRightTab] = useState("crm");
  const [showRight, setShowRight] = useState(false);
  const [profile, setProfile] = useState<ConversationProfile | null>(null);

  // Canned replies and text pushed into the composer by the inventory panel.
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [insert, setInsert] = useState<InsertRequest | null>(null);
  const insertNonce = useRef(0);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ search, filter });
    const res = await fetch(`/api/messenger/conversations?${params}`).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setRows(json.rows);
    setLoaded(true);
  }, [search, filter]);

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, 5000); // near real time: webhook writes to the DB, the list polls it
    return () => clearInterval(timer);
  }, [loadList]);

  const loadTemplates = useCallback(() => {
    fetch("/api/messenger/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const loadProfile = useCallback(() => {
    if (!selectedId) return setProfile(null);
    fetch(`/api/messenger/conversations/${selectedId}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    setProfile(null);
    loadProfile();
  }, [loadProfile]);

  // Facebook's login sends the owner back with ?fb=...: report it once, then clean the address bar.
  useEffect(() => {
    if (!fbStatus.fb) return;
    if (fbStatus.fb === "connected") {
      setConnected(true);
      if (fbStatus.warn) toast.warning(`Đã kết nối Page nhưng: ${fbStatus.warn}`, { duration: 15000 });
      else toast.success("Đã kết nối Page và bật nhận tin nhắn");
    } else if (fbStatus.fb === "error") toast.error(fbStatus.msg ?? "Kết nối Facebook thất bại", { duration: 10000 });
    else if (fbStatus.fb === "pick") toast.info("Chọn Page muốn kết nối");
    router.replace(pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [syncing, setSyncing] = useState<string | null>(null);

  // Imports the Page's old conversations batch by batch; safe to run again (messages are de-duplicated).
  async function syncHistory() {
    if (syncing) return;
    let cursor: string | null = null;
    let conversations = 0;
    let messages = 0;
    setSyncing("Đang đồng bộ lịch sử…");
    for (let guard = 0; guard < 500; guard++) {
      const step = await syncHistoryStepAction(cursor);
      conversations += step.conversations;
      messages += step.messages;
      if (!step.ok) {
        setSyncing(null);
        setBanner({ tone: "error", text: `Đồng bộ dừng sau ${conversations} hội thoại: ${step.error}` });
        loadList();
        return;
      }
      setSyncing(`Đang đồng bộ lịch sử… ${conversations} hội thoại, ${messages} tin nhắn mới`);
      loadList();
      if (!step.next) break;
      cursor = step.next;
    }
    setSyncing(null);
    toast.success(`Đã đồng bộ ${conversations} hội thoại, thêm ${messages} tin nhắn mới`);
    loadList();
  }

  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    loadList();
  }, [loadList]);

  const refreshConnection = useCallback(() => {
    fetch("/api/messenger/config")
      .then((r) => r.json())
      .then((c) => setConnected(Boolean(c.hasToken)))
      .catch(() => {});
  }, []);

  const handleInsert = useCallback((request: Omit<InsertRequest, "nonce">) => {
    insertNonce.current += 1;
    setInsert({ ...request, nonce: insertNonce.current });
  }, []);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const templateVars = useMemo(
    () => ({
      ten_khach: profile?.customer?.name ?? selected?.customerName ?? "bạn",
      ma_van_don: profile?.shipment?.trackingCode ?? null,
      don_vi_van_chuyen: profile?.shipment?.carrier ?? null,
    }),
    [profile, selected?.customerName]
  );

  return (
    <div className="space-y-3">
      {banner && (
        <div
          role="alert"
          className={cn(
            "flex items-start justify-between gap-3 rounded-2xl border p-3 text-sm",
            banner.tone === "error"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          )}
        >
          <span className="break-words">{banner.text}</span>
          <button type="button" className="shrink-0 text-xs underline" onClick={() => setBanner(null)}>
            Đóng
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />
          {connected
            ? "Đã kết nối Facebook Page — tin nhắn mới tự cập nhật"
            : "Chưa kết nối Page — vẫn dùng được “Tra cứu kho” để sao chép báo giá dán vào Messenger/Zalo"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!connected || Boolean(syncing)}
            onClick={syncHistory}
            title={connected ? "Tải lịch sử tin nhắn của Page về web" : "Kết nối Page trước"}
          >
            <History className="h-4 w-4" />
            {syncing ? "Đang đồng bộ…" : "Đồng bộ lịch sử"}
          </Button>
          <ConnectionDialog connected={connected} onChanged={refreshConnection} openOnMount={openPicker} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 xl:hidden"
            onClick={() => setShowRight((v) => !v)}
          >
            <PanelRight className="h-4 w-4" />
            Hồ sơ & Kho
          </Button>
        </div>
      </div>

      {syncing && <p className="text-xs font-medium text-indigo-500">{syncing}</p>}

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:h-[calc(100vh-15rem)] xl:min-h-[560px] xl:grid-cols-[310px_minmax(0,1fr)_340px]">
        {/* Conversation list */}
        <div
          className={cn(
            PANEL,
            "flex h-[72vh] min-h-[480px] min-w-0 flex-col overflow-hidden xl:h-auto xl:min-h-0",
            selectedId && "hidden lg:flex"
          )}
        >
          <div className="space-y-2 border-b border-border/60 p-3 dark:border-slate-800/80">
            <div className="thin-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {CONVERSATION_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === f.key
                      ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                      : "border-border/70 text-muted-foreground hover:text-foreground dark:border-slate-700/80"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm khách, tin nhắn..."
                className="h-9 pl-9"
              />
            </div>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {loaded && rows.length === 0 && (
              <div className="space-y-1 px-4 py-10 text-center text-sm text-muted-foreground">
                <MessageCircle className="mx-auto h-8 w-8 opacity-40" />
                <p>{filter === "all" && !search ? "Chưa có hội thoại nào." : "Không có hội thoại phù hợp bộ lọc."}</p>
                {filter === "all" && !search && (
                  <p className="text-xs">Khi khách nhắn vào Page, hội thoại sẽ hiện ở đây.</p>
                )}
              </div>
            )}
            {rows.map((c) => {
              const label = labelOf(c.label);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/40 px-3 py-3 text-left transition-colors hover:bg-accent/60 dark:border-slate-800/60",
                    selectedId === c.id && "bg-primary/10 dark:bg-indigo-500/15"
                  )}
                >
                  {c.profilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.profilePic} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                      {c.customerName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                        {c.customerName}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{shortTime(c.lastMessageAt)}</span>
                    </div>
                    {(label || c.hasGrading) && (
                      <div className="flex flex-wrap gap-1">
                        {label && (
                          <Badge variant={label.variant} className="px-1 py-0 text-[10px]">
                            {label.emoji} {label.label}
                          </Badge>
                        )}
                        {c.hasGrading && (
                          <Badge variant="indigo" className="px-1 py-0 text-[10px]">
                            {GRADING_BADGE.emoji} {GRADING_BADGE.label}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-xs",
                          c.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {c.lastMessageText || "—"}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat */}
        <div
          className={cn(
            PANEL,
            "h-[72vh] min-h-[480px] min-w-0 overflow-hidden xl:h-auto xl:min-h-0",
            !selectedId && "hidden lg:block"
          )}
        >
          {selectedId ? (
            <div className="flex h-full min-h-0 flex-col">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start rounded-none border-b border-border/60 lg:hidden dark:border-slate-800/80"
                onClick={() => setSelectedId(null)}
              >
                ← Danh sách
              </Button>
              <div className="min-h-0 flex-1">
                <ChatPanel
                  conversationId={selectedId}
                  refreshToken={refreshToken}
                  onChanged={loadList}
                  onDeleted={handleDeleted}
                  templates={templates}
                  onEditTemplates={() => setTemplatesOpen(true)}
                  templateVars={templateVars}
                  insert={insert}
                  meta={{ label: selected?.label ?? null, hasGrading: selected?.hasGrading ?? false }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-40" />
              Chọn một hội thoại để bắt đầu trả lời khách
            </div>
          )}
        </div>

        {/* Right column: CRM profile + inventory lookup (one instance, placed by breakpoint) */}
        <div
          className={cn(
            PANEL,
            "h-[600px] min-w-0 overflow-hidden lg:col-span-2 xl:col-span-1 xl:block xl:h-auto xl:min-h-0",
            !showRight && "hidden"
          )}
        >
          <RightPanel
            conversationId={selectedId}
            profile={profile}
            onProfileChanged={() => {
              loadProfile();
              loadList();
            }}
            onInsert={handleInsert}
            tab={rightTab}
            onTabChange={setRightTab}
          />
        </div>
      </div>

      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        onSaved={loadTemplates}
      />
    </div>
  );
}
