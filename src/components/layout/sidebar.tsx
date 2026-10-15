"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, MessageSquareText } from "lucide-react";

import { SIDEBAR_COOKIE } from "@/components/layout/nav-items";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { cn } from "@/lib/utils";

const LG_QUERY = "(min-width: 1024px)";

// Assume desktop on the server; the client corrects it right after hydration.
function useIsLg(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(LG_QUERY);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(LG_QUERY).matches,
    () => true
  );
}

// Full sidebar from lg (collapsible by the user, remembered in a cookie so the first paint is already right);
// between md and lg it is always the icon rail. Phones use the drawer in the top bar instead.
export function Sidebar({ defaultCollapsed }: { defaultCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isLg = useIsLg();
  const rail = collapsed || !isLg;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  const labelClass = cn(
    "truncate text-[17px] font-semibold tracking-tight transition-opacity duration-200",
    collapsed ? "opacity-0" : "max-lg:opacity-0"
  );

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-[76px] lg:w-60"
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-sidebar-border px-5">
        <Link
          href="/"
          aria-label="CardNest — Tổng quan"
          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/30">
            <Layers className="h-[18px] w-[18px]" />
          </span>
          <span className={labelClass}>CardNest</span>
        </Link>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
        aria-expanded={!collapsed}
        title={collapsed ? "Mở rộng" : "Thu gọn"}
        className="absolute -right-3.5 top-[18px] z-30 hidden h-7 w-7 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-muted-foreground shadow-sm transition-colors duration-200 hover:bg-primary/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <SidebarNav collapsed={collapsed} rail={rail} variant="sidebar" />

      {/* Only where there is room: expanded, desktop width and a tall enough viewport. */}
      {!collapsed && (
        <div className="hidden shrink-0 p-3 pt-0 lg:[@media(min-height:780px)]:block">
          <div className="rounded-2xl border border-primary/25 bg-card/60 p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-accent-foreground">
              <MessageSquareText className="h-4 w-4" />
            </span>
            <p className="mt-2.5 text-sm font-semibold">Trả lời nhanh với tin nhắn mẫu</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Soạn sẵn các câu trả lời thường dùng để phản hồi khách chỉ với một lần bấm.
            </p>
            <Link
              href="/messages?panel=templates"
              className="mt-3 flex h-9 w-full items-center justify-center rounded-xl bg-brand-gradient text-[13px] font-semibold text-white shadow-md shadow-primary/25 transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              Quản lý tin nhắn mẫu
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}
