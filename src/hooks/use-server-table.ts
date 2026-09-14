"use client";

import { useEffect, useState } from "react";
import type { SortingState } from "@tanstack/react-table";

interface PagedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function useServerTable<T>(endpoint: string, extraParams: Record<string, string> = {}) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  const extraParamsKey = JSON.stringify(extraParams);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      search,
      ...JSON.parse(extraParamsKey),
    });

    if (sorting[0]) {
      params.set("sortBy", sorting[0].id);
      params.set("sortDir", sorting[0].desc ? "desc" : "asc");
    }

    fetch(`${endpoint}?${params.toString()}`)
      .then((res) => res.json())
      .then((json: PagedResponse<T>) => {
        if (cancelled) return;
        setData(json.rows);
        setTotal(json.total);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint, page, pageSize, search, sorting, extraParamsKey, refreshToken]);

  // reset to first page whenever filters change
  useEffect(() => {
    setPage(1);
  }, [search, extraParamsKey]);

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
    refresh,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
