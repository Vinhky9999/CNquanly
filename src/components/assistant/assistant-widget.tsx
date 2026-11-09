"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { cn } from "@/lib/utils";

// Floating button (bottom right) that opens the assistant on any page. It stays out of the way on the assistant page
// itself and on the Page inbox, which already uses the whole screen.
export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hidden = pathname.startsWith("/assistant") || pathname.startsWith("/messages");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Trợ lý quản lý CardNest"
          className="fixed bottom-20 right-4 z-40 flex h-[min(72dvh,620px)] w-[min(94vw,420px)] flex-col shadow-2xl shadow-black/40 sm:right-6"
        >
          <AssistantChat compact className="h-full" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Đóng trợ lý" : "Mở trợ lý quản lý"}
        title={open ? "Đóng trợ lý" : "Trợ lý quản lý AI"}
        className={cn(
          "fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg shadow-primary/40 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:right-6",
          open && "rotate-90"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </>
  );
}
