"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, History, Loader2, MessageCircle, PanelRight, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel, type Conversation, type InsertRequest, type Template } from "@/components/messages/chat-panel";
import { ConfirmPaymentDialog } from "@/components/messages/confirm-payment-dialog";
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

// Panels: navy glass cards, hairline border, large rounding.
const PANEL = "rounded-[20px] border border-border/70 bg-card shadow-lg shadow-black/10 dark:shadow-black/30";

export interface FbStatus {
  fb: string | null;
  msg: string | null;
  warn: string | null;
}

type Counts = Record<ConversationFilter, number>;

function ConversationRow({ c, active, onSelect }: { c: Conversation; active: boolean; onSelect: () => void }) {
  const label = labelOf(c.label);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-all duration-150 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary/40 bg-brand-soft hover:bg-brand-soft"
      )}
    >
      {c.profilePic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.profilePic} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
          {c.customerName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold text-foreground" : "font-medium")}>
            {c.customerName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{shortTime(c.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn("truncate text-xs", c.unreadCount > 0 ? "font-medium text-foreground/90" : "text-muted-foreground")}>
            {c.lastMessageText || "—"}
          </span>
          {c.unreadCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
              {c.unreadCount}
            </span>
          )}
        </div>
        {(label || c.hasGrading) && (
          <div className="mt-1 flex flex-wrap gap-1">
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
      </div>
    </button>
  );
}

function GroupHeader({ title, count, open, onToggle }: { title: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        {title} <span className="text-[10px] opacity-70">({count})</span>
      </span>
      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", !open && "-rotate-90")} />
    </button>
  );
}

export function InboxWorkspace({ initialConnected, fbStatus }: { initialConnected: boolean; fbStatus: FbStatus }) {
  const router = useRouter();
  const pathname = usePathname();
  // The sidebar deep-links into the two dialogs of this page with ?panel=connection | templates.
  const panel = useSearchParams()?.get("panel") ?? null;
  // The Facebook callback asks the owner to pick a Page: open the connection dialog straight away.
  const [connectionOpen, setConnectionOpen] = useState(fbStatus.fb === "pick" || panel === "connection");
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
  const [counts, setCounts] = useState<Counts | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [openGroups, setOpenGroups] = useState({ unread: true, rest: true });

  // Right column: CRM profile / inventory lookup. Below xl it is a slide-over drawer.
  const [rightTab, setRightTab] = useState("crm");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<ConversationProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Canned replies and text pushed into the composer by the inventory panel.
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(panel === "templates");
  const [insert, setInsert] = useState<InsertRequest | null>(null);
  const insertNonce = useRef(0);

  // "Xác nhận thanh toán": order + customer spend + cash-flow income, shared by the chat header, banner and CRM tabs.
  const [payment, setPayment] = useState<{ notice: string | null } | null>(null);

  useEffect(() => {
    if (panel === "connection") setConnectionOpen(true);
    else if (panel === "templates") setTemplatesOpen(true);
  }, [panel]);

  // Closing a dialog that was opened by the link also clears the param, so the sidebar highlight returns to "Hộp thư".
  const changeConnectionOpen = (next: boolean) => {
    setConnectionOpen(next);
    if (!next && panel === "connection") router.replace(pathname, { scroll: false });
  };
  const changeTemplatesOpen = (next: boolean) => {
    setTemplatesOpen(next);
    if (!next && panel === "templates") router.replace(pathname, { scroll: false });
  };

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ search, filter });
    const res = await fetch(`/api/messenger/conversations?${params}`).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setRows(json.rows);
    setCounts(json.counts ?? null);
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
    setProfileLoading(true);
    fetch(`/api/messenger/conversations/${selectedId}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [selectedId]);

  useEffect(() => {
    setProfile(null);
    loadProfile();
  }, [loadProfile]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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
    setDrawerOpen(false); // the drawer would otherwise hide the composer the text just landed in
  }, []);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function handlePaymentConfirmed(order: { code: string; total: number; customerName: string; createdCustomer: boolean; duplicate: boolean }) {
    const amount = new Intl.NumberFormat("vi-VN").format(order.total);
    toast.success(
      order.duplicate
        ? `Đơn ${order.code} đã được ghi nhận trước đó`
        : `Đã ghi nhận đơn ${order.code} · ${amount} ₫ vào Dòng tiền${order.createdCustomer ? " · đã tạo hồ sơ khách mới" : ""}`
    );
    // Reload everything that shows the new order: chat (clears the payment banner), CRM profile and the list.
    setRefreshToken((n) => n + 1);
    loadProfile();
    loadList();
    // Drafted, never sent: the owner reads it and presses send himself.
    if (!order.duplicate) {
      handleInsert({ text: `Shop đã nhận thanh toán ${amount}đ cho đơn ${order.code}. Cảm ơn bạn đã ủng hộ shop ạ!` });
    }
    setRightTab("history");
  }
  const templateVars = useMemo(
    () => ({
      ten_khach: profile?.customer?.name ?? selected?.customerName ?? "bạn",
      ma_van_don: profile?.shipment?.trackingCode ?? null,
      don_vi_van_chuyen: profile?.shipment?.carrier ?? null,
    }),
    [profile, selected?.customerName]
  );

  const unreadRows = rows.filter((r) => r.unreadCount > 0);
  const restRows = rows.filter((r) => r.unreadCount === 0);

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[520px] flex-col gap-4 md:h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-7.5rem)]">
      {/* Page header: title + status on the left, actions on the right, description underneath */}
      <div className="shrink-0 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Page</h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                connected
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-500"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success" : "bg-amber-500")} />
              {connected ? "Đã kết nối Facebook Page" : "Chưa kết nối Page"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/50"
              disabled={!connected || Boolean(syncing)}
              onClick={syncHistory}
              title={connected ? "Tải lịch sử tin nhắn của Page về web" : "Kết nối Page trước"}
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              {syncing ? "Đang đồng bộ…" : "Đồng bộ lịch sử"}
            </Button>
            <ConnectionDialog
              connected={connected}
              onChanged={refreshConnection}
              open={connectionOpen}
              onOpenChange={changeConnectionOpen}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-xl border-border/80 bg-input hover:bg-accent/50 min-[1360px]:hidden"
              onClick={() => setDrawerOpen(true)}
              title="Hồ sơ khách & tra cứu kho"
            >
              <PanelRight className="h-4 w-4" />
              <span className="hidden sm:inline">Hồ sơ & Kho</span>
            </Button>
          </div>
        </div>
        <p className="hidden text-sm text-muted-foreground md:block">
          Hộp thư Facebook Fanpage: trả lời khách và gửi thông tin thẻ / báo giá từ kho ngay trong khung chat.
          {!connected && " Chưa kết nối Page — vẫn dùng được “Tra cứu kho” để sao chép báo giá."}
        </p>
      </div>

      {banner && (
        <div
          role="alert"
          className={cn(
            "flex shrink-0 items-start justify-between gap-3 rounded-2xl border p-3 text-sm",
            banner.tone === "error"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          )}
        >
          <span className="break-words">{banner.text}</span>
          <button type="button" className="shrink-0 text-xs underline" onClick={() => setBanner(null)}>
            Đóng
          </button>
        </div>
      )}
      {syncing && <p className="shrink-0 text-xs font-medium text-accent-foreground">{syncing}</p>}

      {/* Three columns, each scrolling on its own */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] min-[1360px]:grid-cols-[290px_minmax(0,1fr)_340px]">
        {/* Column 1 — conversations */}
        <div className={cn(PANEL, "flex min-h-0 min-w-0 flex-col overflow-hidden", selectedId && "hidden lg:flex")}>
          <div className="shrink-0 space-y-3 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm khách, tin nhắn..."
                aria-label="Tìm hội thoại"
                className="h-10 rounded-2xl border-border/80 bg-input pl-10"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Xoá tìm kiếm"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="thin-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Lọc hội thoại">
              {CONVERSATION_FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-transparent bg-brand-gradient text-white shadow-md shadow-primary/25"
                        : "border-border/80 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {f.label}
                    {counts && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] tabular-nums",
                          active ? "bg-white/25" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {counts[f.key]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {!loaded && (
              <div className="space-y-2 p-2" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {loaded && rows.length === 0 && (
              <div className="space-y-1 px-4 py-12 text-center text-sm text-muted-foreground">
                <MessageCircle className="mx-auto h-9 w-9 opacity-40" />
                <p>{filter === "all" && !search ? "Chưa có hội thoại nào." : "Không có hội thoại phù hợp bộ lọc."}</p>
                {filter === "all" && !search && <p className="text-xs">Khi khách nhắn vào Page, hội thoại sẽ hiện ở đây.</p>}
              </div>
            )}
            {unreadRows.length > 0 && (
              <>
                <GroupHeader
                  title="Chưa đọc"
                  count={unreadRows.length}
                  open={openGroups.unread}
                  onToggle={() => setOpenGroups((g) => ({ ...g, unread: !g.unread }))}
                />
                {openGroups.unread &&
                  unreadRows.map((c) => (
                    <ConversationRow key={c.id} c={c} active={selectedId === c.id} onSelect={() => setSelectedId(c.id)} />
                  ))}
              </>
            )}
            {restRows.length > 0 && (
              <>
                <GroupHeader
                  title={unreadRows.length > 0 ? "Đã xem" : "Tất cả hội thoại"}
                  count={restRows.length}
                  open={openGroups.rest}
                  onToggle={() => setOpenGroups((g) => ({ ...g, rest: !g.rest }))}
                />
                {openGroups.rest &&
                  restRows.map((c) => (
                    <ConversationRow key={c.id} c={c} active={selectedId === c.id} onSelect={() => setSelectedId(c.id)} />
                  ))}
              </>
            )}
          </div>
        </div>

        {/* Column 2 — chat */}
        <div className={cn(PANEL, "min-h-0 min-w-0 overflow-hidden", !selectedId && "hidden lg:block")}>
          {selectedId ? (
            <div className="flex h-full min-h-0 flex-col">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 shrink-0 justify-start rounded-none border-b border-border/70 lg:hidden"
                onClick={() => setSelectedId(null)}
              >
                ← Danh sách hội thoại
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
                  onOpenProfile={() => setDrawerOpen(true)}
                  onOpenPayment={(notice) => setPayment({ notice })}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft">
                <MessageCircle className="h-7 w-7 text-accent-foreground" />
              </div>
              Chọn một hội thoại để bắt đầu trả lời khách
            </div>
          )}
        </div>

        {/* Column 3 — profile & inventory (drawer below xl) */}
        {drawerOpen && (
          <button
            type="button"
            aria-label="Đóng hồ sơ khách"
            className="fixed inset-0 z-40 cursor-default bg-black/60 min-[1360px]:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        <aside
          aria-label="Hồ sơ khách và tra cứu kho"
          className={cn(
            PANEL,
            "min-h-0 min-w-0 overflow-hidden",
            "fixed inset-y-3 right-3 z-50 w-[min(94vw,400px)] transition-transform duration-200 ease-out",
            drawerOpen ? "translate-x-0" : "invisible translate-x-[110%]",
            "min-[1360px]:visible min-[1360px]:static min-[1360px]:z-auto min-[1360px]:w-auto min-[1360px]:translate-x-0 min-[1360px]:transition-none"
          )}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2 min-[1360px]:hidden">
              <span className="text-sm font-semibold">Hồ sơ & Tra cứu kho</span>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDrawerOpen(false)} title="Đóng" aria-label="Đóng">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <RightPanel
                conversationId={selectedId}
                profile={profile}
                profileLoading={profileLoading}
                onProfileChanged={() => {
                  loadProfile();
                  loadList();
                }}
                onInsert={handleInsert}
                onConfirmPayment={() => setPayment({ notice: null })}
                tab={rightTab}
                onTabChange={setRightTab}
              />
            </div>
          </div>
        </aside>
      </div>

      <ConfirmPaymentDialog
        open={payment !== null}
        onOpenChange={(open) => !open && setPayment(null)}
        conversationId={selectedId}
        customerName={profile?.customer?.name ?? selected?.customerName ?? "khách"}
        linked={Boolean(profile?.customer)}
        notice={payment?.notice ?? null}
        onConfirmed={handlePaymentConfirmed}
      />

      <TemplatesDialog open={templatesOpen} onOpenChange={changeTemplatesOpen} templates={templates} onSaved={loadTemplates} />
    </div>
  );
}
