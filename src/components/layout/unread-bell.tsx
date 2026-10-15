"use client";

import Link from "next/link";
import { Bell } from "lucide-react";

import { useUnreadMessages } from "@/hooks/use-unread-messages";

/** Header bell: real unread Page messages, links to the inbox. */
export function UnreadBell() {
  const unread = useUnreadMessages();
  const label = unread > 0 ? `${unread} tin nhắn Page chưa đọc` : "Không có tin nhắn mới";

  return (
    <Link
      href="/messages"
      title={label}
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="h-[18px] w-[18px]" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-background">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
