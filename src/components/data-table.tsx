"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    onMutated?: () => void;
  }
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Horizontal alignment of the header and the cells of this column. */
    align?: "left" | "center" | "right";
    /** Extra classes for the header and cells (e.g. a width). */
    className?: string;
    /** Stacked layout: label shown above the value. Defaults to the header text; "" shows none. */
    label?: string;
    /** Stacked layout: name of this column in the "Sắp xếp" list. Defaults to `label`, then the header text. */
    sortLabel?: string;
    /** Stacked layout: "full" = the cell takes a whole row of the card; "end" = a footer row (row actions). */
    stack?: "full" | "end";
  }
}
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Search,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  pageCount: number;
  search: string;
  onSearchChange: (search: string) => void;
  searchPlaceholder?: string;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  isLoading?: boolean;
  toolbarExtra?: React.ReactNode;
  onMutated?: () => void;
  /** Shown instead of the rows when loading failed. */
  error?: string | null;
  onRetry?: () => void;
  /** Header stays visible while the rows scroll inside the table area. */
  stickyHeader?: boolean;
  /** Minimum width of the table; below it the table area scrolls horizontally (never the page). */
  minWidth?: number;
  /**
   * When the table area is narrower than this (px), every row becomes a stacked card that shows all of its fields,
   * so nothing needs a horizontal scrollbar. A "Sắp xếp" list replaces the column headers. Off when not set.
   */
  stackBelow?: number;
  /** Tighter cell padding, for tables with many columns. */
  compact?: boolean;
  /** Adds a checkbox column; rows are identified by their `id`. */
  selectable?: boolean;
  /** Bulk-action bar content, shown while rows are selected. */
  renderSelectionBar?: (selected: T[], clear: () => void) => React.ReactNode;
  emptyMessage?: string;
}

const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;
const JUSTIFY_CLASS = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;

// Columns that sort numbers or dates start with the biggest value; names start A-Z.
const sortsAscendingFirst = (id: string) => id === "name" || id === "cardName";

export function DataTable<T>({
  columns,
  data,
  total,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageCount,
  search,
  onSearchChange,
  searchPlaceholder = "Tìm kiếm nhanh...",
  sorting,
  onSortingChange,
  isLoading,
  toolbarExtra,
  onMutated,
  error,
  onRetry,
  stickyHeader = false,
  minWidth,
  stackBelow,
  compact = false,
  selectable = false,
  renderSelectionBar,
  emptyMessage = "Không có dữ liệu",
}: DataTableProps<T>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [stacked, setStacked] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);

  // A new page / filter / refresh brings different rows: start with nothing selected.
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  // Stacked cards instead of a horizontal scrollbar when the table area is narrower than `stackBelow`.
  // The area's width comes from its parent, not from its content, so the layout cannot flip back and forth.
  useEffect(() => {
    const el = areaRef.current;
    if (!stackBelow || !el) {
      setStacked(false);
      return;
    }
    const update = () => setStacked(el.clientWidth < stackBelow);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [stackBelow]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getRowId: (row, index) => String((row as { id?: string }).id ?? index),
    state: { sorting, rowSelection },
    pageCount,
    meta: { onMutated },
  });

  const rows = table.getRowModel().rows;
  const selectedRows = useMemo(() => rows.filter((r) => r.getIsSelected()).map((r) => r.original), [rows, rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps
  const columnCount = columns.length + (selectable ? 1 : 0);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const cellPad = compact ? "px-2.5 py-2.5" : "px-4 py-3";
  const headPad = compact ? "px-2.5 py-2.5" : "px-4 py-3";

  // Stacked layout: the column headers are hidden, so the sortable columns move into a list above the cards.
  const sortableColumns = table.getAllLeafColumns().filter((c) => c.getCanSort());
  const sortLabel = (c: (typeof sortableColumns)[number]) => {
    const meta = c.columnDef.meta;
    return meta?.sortLabel ?? meta?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id);
  };
  const activeSort = sorting[0];

  return (
    <div className="group/dt space-y-3" data-layout={stacked ? "stacked" : "table"}>
      {/* Toolbar: search, filters and the primary action share one row when there is room */}
      <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-3 shadow-sm sm:px-4">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 rounded-xl border-border/80 bg-input pl-10 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Xoá tìm kiếm"
              title="Xoá tìm kiếm"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {toolbarExtra}
      </div>

      {/* Bulk-action bar */}
      {selectable && selectedRows.length > 0 && renderSelectionBar && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm"
        >
          <span className="font-medium">
            Đã chọn <span className="tabular-nums">{selectedRows.length}</span> trên trang này
          </span>
          <div className="flex flex-wrap items-center gap-2">{renderSelectionBar(selectedRows, () => setRowSelection({}))}</div>
          <button
            type="button"
            onClick={() => setRowSelection({})}
            className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Stacked layout only: select-all and sorting, which the hidden column headers normally provide */}
      {stacked && (selectable || sortableColumns.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm">
          {selectable && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                aria-label="Chọn tất cả trên trang này"
                checked={table.getIsAllRowsSelected()}
                ref={(el) => {
                  if (el) el.indeterminate = table.getIsSomeRowsSelected();
                }}
                onChange={table.getToggleAllRowsSelectedHandler()}
                className="h-4 w-4 cursor-pointer rounded accent-[hsl(var(--primary))]"
              />
              Chọn tất cả
            </label>
          )}
          {sortableColumns.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sắp xếp</span>
              <Select
                value={activeSort?.id ?? "__default"}
                onValueChange={(id) => {
                  if (id === "__default") onSortingChange([]);
                  else onSortingChange([{ id, desc: activeSort?.id === id ? activeSort.desc : !sortsAscendingFirst(id) }]);
                }}
              >
                <SelectTrigger className="h-9 w-[170px] rounded-xl bg-input" aria-label="Sắp xếp theo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">Mặc định (mới nhất)</SelectItem>
                  {sortableColumns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {sortLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl bg-input"
                disabled={!activeSort}
                onClick={() => activeSort && onSortingChange([{ id: activeSort.id, desc: !activeSort.desc }])}
                title={activeSort?.desc ? "Đang giảm dần, bấm để tăng dần" : "Đang tăng dần, bấm để giảm dần"}
                aria-label="Đổi chiều sắp xếp"
              >
                {activeSort?.desc === false ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Only this area scrolls horizontally (and vertically when the header is sticky) */}
      <div ref={areaRef} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div
          className={cn(
            "thin-scroll overflow-x-auto",
            stickyHeader &&
              "max-h-[min(72vh,780px)] overflow-y-auto group-data-[layout=stacked]/dt:max-h-none group-data-[layout=stacked]/dt:overflow-y-visible"
          )}
        >
          <table
            className="w-full caption-bottom text-sm group-data-[layout=stacked]/dt:block"
            style={minWidth && !stacked ? { minWidth } : undefined}
          >
            <thead className="group-data-[layout=stacked]/dt:hidden">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {selectable && (
                    <th
                      scope="col"
                      className={cn(
                        "w-11 border-b border-border/70 bg-input",
                        headPad,
                        stickyHeader && "sticky top-0 z-10"
                      )}
                    >
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả sản phẩm trên trang này"
                        title="Chọn tất cả trên trang này"
                        checked={table.getIsAllRowsSelected()}
                        ref={(el) => {
                          if (el) el.indeterminate = table.getIsSomeRowsSelected();
                        }}
                        onChange={table.getToggleAllRowsSelectedHandler()}
                        className="h-4 w-4 cursor-pointer rounded accent-[hsl(var(--primary))]"
                      />
                    </th>
                  )}
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    const meta = header.column.columnDef.meta;
                    const align = meta?.align ?? "left";
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : undefined}
                        className={cn(
                          "border-b border-border/70 bg-input text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                          // Compact tables let long headers wrap onto two lines instead of widening the column.
                          compact ? "whitespace-normal leading-tight" : "whitespace-nowrap",
                          headPad,
                          ALIGN_CLASS[align],
                          stickyHeader && "sticky top-0 z-10",
                          meta?.className
                        )}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            disabled={!canSort}
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn(
                              "flex w-full items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:text-muted-foreground",
                              JUSTIFY_CLASS[align],
                              // A button centres its text by default; matters once a compact header wraps to two lines.
                              compact && ALIGN_CLASS[align],
                              sortDir && "text-foreground"
                            )}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort &&
                              (sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3 shrink-0 text-primary" />
                              ) : sortDir === "desc" ? (
                                <ArrowDown className="h-3 w-3 shrink-0 text-primary" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
                              ))}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="group-data-[layout=stacked]/dt:block">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40 group-data-[layout=stacked]/dt:grid">
                    <td
                      colSpan={columnCount}
                      className={cn(cellPad, "group-data-[layout=stacked]/dt:block group-data-[layout=stacked]/dt:[grid-column:1/-1]")}
                    >
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr className="group-data-[layout=stacked]/dt:grid">
                  <td colSpan={columnCount} className="px-4 py-12 text-center group-data-[layout=stacked]/dt:block group-data-[layout=stacked]/dt:[grid-column:1/-1]">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-sm text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 text-danger" />
                      <p>{error}</p>
                      {onRetry && (
                        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                          Thử lại
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                      "border-b border-border/40 transition-colors duration-150 last:border-0 hover:bg-accent/25 data-[state=selected]:bg-primary/10",
                      // Stacked: the row is a card. Fields flow into as many columns as fit; wide cells take a full row.
                      "group-data-[layout=stacked]/dt:relative group-data-[layout=stacked]/dt:grid group-data-[layout=stacked]/dt:[grid-template-columns:repeat(auto-fit,minmax(112px,1fr))] group-data-[layout=stacked]/dt:gap-x-3 group-data-[layout=stacked]/dt:gap-y-2.5 group-data-[layout=stacked]/dt:p-3"
                    )}
                  >
                    {selectable && (
                      <td
                        className={cn(
                          "w-11 align-middle",
                          cellPad,
                          "group-data-[layout=stacked]/dt:absolute group-data-[layout=stacked]/dt:right-3 group-data-[layout=stacked]/dt:top-3 group-data-[layout=stacked]/dt:z-[1] group-data-[layout=stacked]/dt:block group-data-[layout=stacked]/dt:w-auto group-data-[layout=stacked]/dt:p-0"
                        )}
                      >
                        <input
                          type="checkbox"
                          aria-label="Chọn dòng này"
                          checked={row.getIsSelected()}
                          onChange={row.getToggleSelectedHandler()}
                          className="h-4 w-4 cursor-pointer rounded accent-[hsl(var(--primary))]"
                        />
                      </td>
                    )}
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      const headerDef = cell.column.columnDef.header;
                      const label = meta?.label ?? (typeof headerDef === "string" ? headerDef : "");
                      return (
                        <td
                          key={cell.id}
                          data-label={label || undefined}
                          className={cn(
                            "align-middle",
                            cellPad,
                            ALIGN_CLASS[meta?.align ?? "left"],
                            meta?.className,
                            "group-data-[layout=stacked]/dt:block group-data-[layout=stacked]/dt:p-0 group-data-[layout=stacked]/dt:text-left",
                            label &&
                              "group-data-[layout=stacked]/dt:before:mb-1 group-data-[layout=stacked]/dt:before:block group-data-[layout=stacked]/dt:before:text-[10px] group-data-[layout=stacked]/dt:before:font-semibold group-data-[layout=stacked]/dt:before:uppercase group-data-[layout=stacked]/dt:before:tracking-wide group-data-[layout=stacked]/dt:before:text-muted-foreground group-data-[layout=stacked]/dt:before:content-[attr(data-label)]",
                            meta?.stack === "full" && "group-data-[layout=stacked]/dt:[grid-column:1/-1]",
                            meta?.stack === "full" && selectable && "group-data-[layout=stacked]/dt:pr-7",
                            meta?.stack === "end" &&
                              "group-data-[layout=stacked]/dt:border-t group-data-[layout=stacked]/dt:border-border/40 group-data-[layout=stacked]/dt:pt-2 group-data-[layout=stacked]/dt:[grid-column:1/-1]"
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr className="group-data-[layout=stacked]/dt:grid">
                  <td colSpan={columnCount} className="px-4 py-14 text-center text-sm text-muted-foreground group-data-[layout=stacked]/dt:block group-data-[layout=stacked]/dt:[grid-column:1/-1]">
                    <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
        <div>
          {total > 0 ? (
            <>
              Hiển thị <span className="font-medium tabular-nums text-foreground">{from}–{to}</span> / tổng{" "}
              <span className="font-medium tabular-nums text-foreground">{total}</span> dòng
            </>
          ) : (
            <>Tổng <span className="font-medium text-foreground">0</span> dòng</>
          )}{" "}
          — Trang {page}/{pageCount}
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-9 w-[110px] rounded-xl bg-input" aria-label="Số dòng mỗi trang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / trang
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl bg-input"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            title="Trang trước"
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl bg-input"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            title="Trang sau"
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
