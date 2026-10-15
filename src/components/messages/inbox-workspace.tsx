"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, PackageSearch, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatPanel, type Conversation } from "@/components/messages/chat-panel";
import { ConnectionDialog } from "@/components/messages/connection-dialog";
import { InventoryPanel } from "@/components/messages/inventory-panel";
import { SimulateDialog } from "@/components/messages/simulate-dialog";
import { cn } from "@/lib/utils";

const shortTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(d);
};

const PANEL = "rounded-2xl border border-border/60 bg-card/80 dark:border-indigo-500/20 dark:bg-slate-900/50 dark:backdrop-blur-md";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showInventory, setShowInventory] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/messenger/conversations?search=${encodeURIComponent(search)}`).catch(() => null);
    if (!res?.ok) return;
    const json = await res.json();
    setRows(json.rows);
    setLoaded(true);
  }, [search]);

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, 5000); // near real time: webhook writes to the DB, the list polls it
    return () => clearInterval(timer);
  }, [loadList]);

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
          {connected ? "Đã kết nối Facebook Page — tin nhắn mới tự cập nhật" : "Chưa kết nối Page — vẫn dùng được “Tra cứu kho” để sao chép báo giá dán vào Messenger/Zalo"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SimulateDialog
            onDone={(id) => {
              loadList();
              setSelectedId(id);
            }}
          />
          <ConnectionDialog connected={connected} onChanged={refreshConnection} openOnMount={openPicker} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 xl:hidden"
            onClick={() => setShowInventory((v) => !v)}
          >
            <PackageSearch className="h-4 w-4" />
            Kho
          </Button>
        </div>
      </div>

      <div className="grid h-[calc(100vh-14rem)] min-h-[480px] gap-3 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Conversation list */}
        <div className={cn(PANEL, "flex min-h-0 flex-col overflow-hidden", selectedId && "hidden lg:flex")}>
          <div className="border-b border-border/60 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm khách, tin nhắn..." className="h-9 pl-9" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loaded && rows.length === 0 && (
              <div className="space-y-1 px-4 py-10 text-center text-sm text-muted-foreground">
                <MessageCircle className="mx-auto h-8 w-8 opacity-40" />
                <p>Chưa có hội thoại nào.</p>
                <p className="text-xs">Kết nối Page hoặc dùng “Mô phỏng khách nhắn” để thử.</p>
              </div>
            )}
            {rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/40 px-3 py-3 text-left transition-colors hover:bg-accent/60",
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                      {c.customerName}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{shortTime(c.lastMessageAt)}</span>
                  </div>
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
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className={cn(PANEL, "min-h-0 overflow-hidden", !selectedId && "hidden lg:block")}>
          {selectedId ? (
            <div className="flex h-full min-h-0 flex-col">
              <Button type="button" variant="ghost" size="sm" className="justify-start rounded-none border-b border-border/60 lg:hidden" onClick={() => setSelectedId(null)}>
                ← Danh sách
              </Button>
              <div className="min-h-0 flex-1">
                <ChatPanel
                  conversationId={selectedId}
                  refreshToken={refreshToken}
                  onChanged={loadList}
                  onDeleted={handleDeleted}
                />
              </div>
              {showInventory && (
                <div className="max-h-72 border-t border-border/60 xl:hidden">
                  <InventoryPanel conversationId={selectedId} onSent={() => { setRefreshToken((t) => t + 1); loadList(); }} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-40" />
              Chọn một hội thoại để bắt đầu trả lời khách
            </div>
          )}
        </div>

        {/* Lookup without a conversation (small screens): copy a quote and paste it into any chat app */}
        {!selectedId && showInventory && (
          <div className={cn(PANEL, "h-[440px] overflow-hidden xl:hidden")}>
            <InventoryPanel conversationId={null} onSent={() => {}} />
          </div>
        )}

        {/* Inventory quick-link (wide screens) */}
        <div className={cn(PANEL, "hidden min-h-0 overflow-hidden xl:block")}>
          <InventoryPanel
            conversationId={selectedId}
            onSent={() => {
              setRefreshToken((t) => t + 1);
              loadList();
            }}
          />
        </div>
      </div>
    </div>
  );
}
