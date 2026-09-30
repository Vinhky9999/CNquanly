"use client";

import { useState } from "react";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

interface ProductThumbnailProps {
  src?: string | null;
  alt: string;
  size?: "sm" | "md";
  className?: string;
}

export function ProductThumbnail({ src, alt, size = "sm", className }: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const dimension = size === "sm" ? "h-9 w-9" : "h-14 w-14";

  if (!src || failed) {
    return (
      <div
        className={cn(
          dimension,
          "flex shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground",
          className
        )}
      >
        <Package className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn(dimension, "shrink-0 rounded-lg border border-border/60 object-cover", className)}
    />
  );
}
