"use client";

import { useEffect, useRef, useState } from "react";

import { searchSealedProductSkusAction } from "@/server/actions/inventory";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatVND, generateSku } from "@/lib/utils";

interface SkuSuggestion {
  sku: string;
  name: string;
  quantity: number;
  costPrice: number;
}

export function SkuAutocomplete() {
  // Suggested only, generated client-side on mount to avoid an SSR/client
  // hydration mismatch (the value is random and must not be computed during render).
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<SkuSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(generateSku("SLD"));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchSealedProductSkusAction(value).then(setSuggestions);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const matched = suggestions.find((s) => s.sku.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor="sku">Mã SKU</Label>
      <div className="relative">
        <Input
          id="sku"
          name="sku"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="VD: SLD-POKE151"
          required
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
            {suggestions.map((s) => (
              <button
                key={s.sku}
                type="button"
                onClick={() => {
                  setValue(s.sku);
                  setOpen(false);
                }}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{s.sku}</span>
                <span className="text-xs text-muted-foreground">
                  {s.name} · Tồn: {s.quantity} · Giá vốn: {formatVND(s.costPrice)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {matched && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
          SKU đã tồn tại — <span className="font-medium">{matched.name}</span>, tồn hiện tại{" "}
          <span className="font-medium">{matched.quantity}</span>, giá vốn hiện tại{" "}
          <span className="font-medium">{formatVND(matched.costPrice)}</span>. Nhập số lượng và giá bên
          dưới sẽ được <span className="font-medium">cộng dồn</span> vào SKU này (giá vốn tính lại theo
          bình quân gia quyền).
        </p>
      )}
    </div>
  );
}
