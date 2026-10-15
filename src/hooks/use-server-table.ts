"use client";

import { useEffect, useState } from "react";
import type { SortingState } from "@tanstack/react-table";

interface PagedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Typing in the search box feeds the server only after this pause, so each keystroke is not a request. */
const SEARCH_DEBOUNCE_MS = 300;

export function useServerTable<T>(endpoint: string, extraParams: Record<string, string> = {}) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const extraParamsKey = JSON.stringify(extraParams);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      search: debouncedSearch,
      ...JSON.parse(extraParamsKey),
    });

    if (sorting[0]) {
      params.set("sortBy", sorting[0].id);
      params.set("sortDir", sorting[0].desc ? "desc" : "asc");
    }

    fetch(`${endpoint}?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: PagedResponse<T>) => {
        if (cancelled) return;
        setData(json.rows);
        setTotal(json.total);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được dữ liệu. Kiểm tra kết nối rồi thử lại.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, page, pageSize, debouncedSearch, sorting, extraParamsKey, refreshToken]);

  // reset to first page whenever filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, extraParamsKey]);

  const refresh = () => setRefreshToken((t) => t + 1);

  return {
    data,
    total,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    sorting,
    setSorting,
    isLoading,
    error,
    refresh,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
