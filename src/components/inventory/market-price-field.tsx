"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Search } from "lucide-react";

import { searchTcgplayerAction, type TcgplayerPick } from "@/server/actions/market-prices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONFIDENT_SCORE } from "@/lib/tcgplayer/constants";
import { formatVND } from "@/lib/utils";

export interface MarketPriceInitial {
  marketPrice: number | null;
  priceSource: string | null;
  label: string | null;
  url: string | null;
  score: number | null;
}

interface MarketPriceFieldProps {
  kind: "SEALED" | "SINGLE";
  game: string;
  /** Product name used to pre-fill the TCGplayer search box. */
  suggestedQuery: string;
  initial: MarketPriceInitial;
}

// "Giá thị trường (TCGplayer)": the VND price, plus the link to the TCGplayer product it follows.
// Submits marketPrice and the hidden priceSource* fields with the surrounding form.
export function MarketPriceField({ kind, game, suggestedQuery, initial }: MarketPriceFieldProps) {
  const [price, setPrice] = useState(initial.marketPrice != null ? String(initial.marketPrice) : "");
  const [source, setSource] = useState(initial.priceSource ?? "");
  const [label, setLabel] = useState(initial.label ?? "");
  const [url, setUrl] = useState(initial.url ?? "");
  const [score, setScore] = useState<number | null>(initial.score);
  const [optOut, setOptOut] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TcgplayerPick[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [isSearching, startSearch] = useTransition();

  const effectiveQuery = query.trim() || suggestedQuery;
  const linked = Boolean(source);
  const approximate = linked && score != null && score < CONFIDENT_SCORE;
  const provider = source.split(":")[0];

  function runSearch() {
    if (!effectiveQuery.trim()) return;
    setError("");
    setSearched(false);
    startSearch(async () => {
      const res = await searchTcgplayerAction(effectiveQuery, game, kind);
      if (!Array.isArray(res)) {
        setError(res.error);
        setResults([]);
      } else {
        setResults(res);
      }
      setSearched(true);
    });
  }

  function pick(p: TcgplayerPick) {
    setSource(p.source);
    setLabel(p.label);
    setUrl(p.url);
    setScore(1);
    setOptOut(false);
    if (p.vnd != null) setPrice(String(p.vnd));
    setPanelOpen(false);
    setResults([]);
    setSearched(false);
  }

  function unlink() {
    setSource("");
    setLabel("");
    setUrl("");
    setScore(null);
    setOptOut(true);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3 backdrop-blur-xl">
      <input type="hidden" name="priceSource" value={source} />
      <input type="hidden" name="priceSourceLabel" value={label} />
      <input type="hidden" name="priceSourceUrl" value={url} />
      <input type="hidden" name="priceOptOut" value={optOut ? "1" : ""} />

      <Label htmlFor="marketPrice">Giá thị trường — TCGplayer (VND, tuỳ chọn)</Label>
      <Input
        id="marketPrice"
        name="marketPrice"
        type="number"
        min={0}
        step="1000"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Tự điền khi liên kết TCGplayer, hoặc nhập tay"
        onFocus={(e) => e.currentTarget.select()}
      />

      {linked ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={approximate ? "warning" : "success"}>
              {approximate ? "Khớp gần đúng — hãy kiểm tra" : provider === "tcgplayer" ? "Theo giá TCGplayer" : `Tự động (${provider})`}
            </Badge>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-indigo-500 underline-offset-2 hover:underline"
              >
                {label || "Xem trên TCGplayer"}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-muted-foreground">{label || source}</span>
            )}
            <button type="button" className="text-muted-foreground underline" onClick={() => setPanelOpen((v) => !v)}>
              Đổi sản phẩm
            </button>
            <button type="button" className="text-muted-foreground underline" onClick={unlink}>
              Bỏ liên kết (giữ giá tay)
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Giá tự cập nhật theo TCGplayer; chỉnh tay ở đây sẽ bị ghi đè ở lần cập nhật kế tiếp trừ khi bỏ liên kết.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {optOut
              ? "Đã bỏ liên kết — dùng giá nhập tay."
              : "Chưa liên kết TCGplayer — hệ thống sẽ tự tìm và khớp giá sau khi lưu."}
          </span>
          <button type="button" className="underline" onClick={() => setPanelOpen((v) => !v)}>
            Tìm trên TCGplayer
          </button>
        </div>
      )}

      {panelOpen && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-2">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder={suggestedQuery || "Tên sản phẩm, hoặc dán link TCGplayer"}
              className="h-10 flex-1"
            />
            <Button type="button" variant="outline" className="h-10" disabled={isSearching || !effectiveQuery.trim()} onClick={runSearch}>
              <Search className="h-4 w-4" />
              {isSearching ? "Đang tìm..." : "Tìm"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {searched && results.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">Không tìm thấy sản phẩm phù hợp trên TCGplayer.</p>
          )}
          {results.length > 0 && (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {results.map((p) => (
                <li key={p.productId}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.setName} · {p.lineName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums">
                      {p.usd != null ? (
                        <>
                          <span className="block font-semibold">${p.usd.toLocaleString("en-US")}</span>
                          <span className="block text-muted-foreground">{p.vnd != null ? formatVND(p.vnd) : ""}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">chưa có giá</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
