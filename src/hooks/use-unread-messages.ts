"use client";

import { useEffect, useState } from "react";

/** Unread Page messages, refreshed every 15 seconds (shared by the sidebar, mobile nav and header bell). */
export function useUnreadMessages(): number {
  const [unread, setUnread] = useState(0);

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

  return unread;
}
