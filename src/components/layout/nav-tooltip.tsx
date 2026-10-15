"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface NavTooltipProps {
  label: string;
  /** Only shown while the sidebar is an icon rail; otherwise the label is already visible. */
  enabled: boolean;
  children: React.ReactNode;
}

// The nav column scrolls (overflow clips absolutely positioned children), so the tooltip is portalled
// and positioned from the trigger's bounding box. The wrapper is always rendered so toggling `enabled`
// never remounts the trigger (which would drop focus / Radix state).
export function NavTooltip({ label, enabled, children }: NavTooltipProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const visible = enabled && pos !== null;

  useEffect(() => {
    if (!pos) return;
    const hide = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
    };
  }, [pos]);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ left: r.right + 10, top: r.top + r.height / 2 });
  };

  return (
    <div
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setPos(null)}
      onPointerDown={() => setPos(null)}
    >
      {children}
      {visible &&
        createPortal(
          <div style={{ left: pos.left, top: pos.top }} className="pointer-events-none fixed z-[60] -translate-y-1/2">
            <div
              role="tooltip"
              className="whitespace-nowrap rounded-lg border border-sidebar-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg animate-in fade-in-0 duration-150"
            >
              {label}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
