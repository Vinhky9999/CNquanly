"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  id: string;
  src: string;
  /** "Ảnh eBay" / "Ảnh tải lên" */
  label?: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  alt: string;
  /** When set, every photo gets a delete button. */
  onDelete?: (id: string) => void | Promise<void>;
  /** When set, shows the "Thêm ảnh" button. */
  onPickFiles?: (files: FileList) => void | Promise<void>;
  busy?: boolean;
}

// Main photo with thumbnails; click the photo to see it large and move through all of them.
export function ImageGallery({ images, alt, onDelete, onPickFiles, busy }: ImageGalleryProps) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = images[Math.min(index, images.length - 1)];

  const step = (dir: number) => setIndex((i) => (i + dir + images.length) % images.length);

  return (
    <div className="space-y-2.5">
      <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/40">
        {current ? (
          <>
            <button type="button" onClick={() => setOpen(true)} className="group flex h-full w-full items-center justify-center" title="Bấm để phóng to" aria-label="Phóng to ảnh">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.src} alt={alt} className="h-full w-full object-contain" />
              <span className="absolute right-2 top-2 rounded-lg bg-black/55 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <ZoomIn className="h-4 w-4" />
              </span>
            </button>
            {images.length > 1 && (
              <>
                <Button type="button" size="icon" variant="secondary" className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full opacity-90" onClick={() => step(-1)} aria-label="Ảnh trước">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="secondary" className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full opacity-90" onClick={() => step(1)} aria-label="Ảnh sau">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {Math.min(index, images.length - 1) + 1}/{images.length}
              {current.label ? ` · ${current.label}` : ""}
            </span>
          </>
        ) : (
          <p className="px-6 text-center text-sm text-muted-foreground">Chưa có ảnh. {onPickFiles ? "Bấm “Thêm ảnh” để tải ảnh lên." : ""}</p>
        )}
      </div>

      {(images.length > 1 || onPickFiles) && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={img.id} className="relative">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                className={cn("h-14 w-14 overflow-hidden rounded-lg border bg-muted/40 transition-colors", i === index ? "border-primary ring-2 ring-primary/40" : "border-border/70 hover:border-primary/50")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt="" className="h-full w-full object-cover" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(img.id)}
                  disabled={busy}
                  aria-label={`Xoá ảnh ${i + 1}`}
                  title="Xoá ảnh này"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {onPickFiles && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/80 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Thêm ảnh
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-4xl"
          onKeyDown={(e) => {
            if (images.length < 2) return;
            if (e.key === "ArrowLeft") step(-1);
            if (e.key === "ArrowRight") step(1);
          }}
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {current && (
            <div className="relative flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.src} alt={alt} className="max-h-[78vh] w-full rounded-lg border border-border/60 object-contain" />
              {images.length > 1 && (
                <>
                  <Button type="button" size="icon" variant="secondary" className="absolute left-2 h-9 w-9 rounded-full" onClick={() => step(-1)} aria-label="Ảnh trước">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button type="button" size="icon" variant="secondary" className="absolute right-2 h-9 w-9 rounded-full" onClick={() => step(1)} aria-label="Ảnh sau">
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>
          )}
          {images.length > 1 && <p className="text-center text-xs text-muted-foreground">Ảnh {Math.min(index, images.length - 1) + 1}/{images.length} · dùng phím ← → để chuyển ảnh</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
