import { LogOut } from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UnreadBell } from "@/components/layout/unread-bell";

export function Topbar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-sidebar/70 px-4 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <span className="text-base font-semibold tracking-tight">CardNest</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-1.5 sm:gap-2">
        <UnreadBell />
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/70 py-1 pl-1 pr-3 text-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-[12px] font-semibold text-white">
            {initial}
          </div>
          <span className="hidden font-medium sm:inline">{username}</span>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" title="Đăng xuất">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
