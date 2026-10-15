"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers } from "lucide-react";

import { isNavActive, navItems } from "@/components/layout/nav-items";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { cn } from "@/lib/utils";

// Full sidebar from lg; between md and lg it collapses to an icon rail (labels move into tooltips).
export function Sidebar() {
  const pathname = usePathname();
  const unread = useUnreadMessages();

  return (
    <aside className="hidden w-[76px] shrink-0 border-r border-border/60 bg-sidebar md:flex md:flex-col lg:w-64">
      <div className="flex h-16 items-center justify-center gap-2.5 border-b border-border/60 px-4 lg:justify-start lg:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/30">
          <Layers className="h-[18px] w-[18px]" />
        </div>
        <span className="hidden text-base font-semibold tracking-tight lg:inline">CardNest</span>
      </div>

      <nav aria-label="Điều hướng chính" className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/messages" && unread > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:justify-start",
                active &&
                  "bg-brand-soft text-primary ring-1 ring-primary/30 hover:bg-brand-soft hover:text-primary dark:text-white dark:hover:text-white"
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-gradient" />}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110",
                  active && "text-primary dark:text-accent-foreground"
                )}
              />
              <span className="hidden truncate lg:inline">{item.label}</span>
              {showBadge && (
                <span
                  className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950 lg:static lg:ml-auto lg:h-5 lg:min-w-5 lg:px-1.5 lg:text-[11px]"
                  aria-label={`${unread} tin nhắn chưa đọc`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
