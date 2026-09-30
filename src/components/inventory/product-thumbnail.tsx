"use client";

import { useState } from "react";
import { Package, ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ProductThumbnailProps {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const DIMENSION: Record<NonNullable<ProductThumbnailProps["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-14 w-14",
  lg: "h-16 w-16",
};

const ICON_SIZE: Record<NonNullable<ProductThumbnailProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function ProductThumbnail({ src, alt, size = "sm", className }: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const dimension = DIMENSION[size];

  if (!src || failed) {
    return (
      <div
        className={cn(
          dimension,
          "flex shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground",
          className
        )}
      >
        <Package className={ICON_SIZE[size]} />
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Xem ảnh phóng to"
          className={cn(
            dimension,
            "group relative shrink-0 overflow-hidden rounded-lg border border-border/60 shadow-sm",
            className
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-110"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100">
            <ZoomIn className="h-4 w-4 text-white" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[75vh] w-full rounded-lg border border-border/60 object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
