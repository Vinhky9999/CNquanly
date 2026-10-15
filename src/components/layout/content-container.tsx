"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// The Page inbox needs the full width for its three columns; every other page keeps the centred reading width.
export function ContentContainer({ children }: { children: React.ReactNode }) {
  const wide = usePathname().startsWith("/messages");
  return <div className={cn(wide ? "w-full" : "mx-auto max-w-7xl")}>{children}</div>;
}
