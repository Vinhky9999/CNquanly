"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Users, Wallet, Truck, Layers, Award, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/shipping", label: "Giao Hàng", icon: Truck },
  { href: "/grading", label: "Chấm điểm", icon: Award },
  { href: "/cash-flow", label: "Dòng tiền", icon: Wallet },
  { href: "/messages", label: "Page", icon: MessageCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Unread Page messages badge, refreshed every 15s.
  useEffect(() => {
    const load = () =>
      fetch("/api/messenger/conversations?summary=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setUnread(Number(j.unread) || 0))
        .catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border/60 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Layers className="h-4 w-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">CardNest</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 transition-transform group-hover:scale-110",
                  isActive && "text-primary"
                )}
              />
              {item.label}
              {item.href === "/messages" && unread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-slate-950">
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
