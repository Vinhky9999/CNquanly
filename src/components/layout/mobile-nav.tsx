"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavActive, navItems } from "@/components/layout/nav-items";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { cn } from "@/lib/utils";

// Phones have no sidebar: the same destinations as a horizontally scrollable strip under the header.
export function MobileNav() {
  const pathname = usePathname();
  const unread = useUnreadMessages();

  return (
    <nav
      aria-label="Điều hướng"
      className="thin-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/60 bg-sidebar px-3 py-2 md:hidden"
    >
      {navItems.map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-primary/40 bg-brand-soft text-primary dark:text-white"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
            {item.href === "/messages" && unread > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-950">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
