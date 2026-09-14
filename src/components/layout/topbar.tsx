import { LogOut } from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Topbar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/60 bg-card/60 px-6 backdrop-blur">
      <div />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background py-1 pl-1 pr-3 text-sm shadow-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initial}
          </div>
          <span className="font-medium">{username}</span>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </form>
      </div>
    </header>
  );
}
