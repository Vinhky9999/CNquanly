"use client";

import { useState } from "react";
import { Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { CustomerTag } from "@prisma/client";
import { updateCustomerTagAction, deleteCustomerTagAction } from "@/server/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface TagManageDialogProps {
  tags: CustomerTag[];
  onChange: (tags: CustomerTag[]) => void;
}

function TagRow({
  tag,
  onSaved,
  onDeleted,
}: {
  tag: CustomerTag;
  onSaved: (tag: CustomerTag) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? "#94a3b8");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const dirty = name !== tag.name || color !== (tag.color ?? "#94a3b8");

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const updated = await updateCustomerTagAction(tag.id, name.trim(), color);
      onSaved(updated);
      toast.success("Đã lưu tag");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể lưu tag");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Xoá tag "${tag.name}"? Tag sẽ bị gỡ khỏi mọi khách hàng đang gắn.`)) return;
    setIsDeleting(true);
    try {
      await deleteCustomerTagAction(tag.id);
      onDeleted(tag.id);
      toast.success("Đã xoá tag");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xoá tag");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded border"
      />
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!dirty || isSaving}
        onClick={handleSave}
      >
        Lưu
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={isDeleting}
        onClick={handleDelete}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function TagManageDialog({ tags, onChange }: TagManageDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-6 w-6" title="Quản lý tag">
          <Settings className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quản lý tag khách hàng</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có tag nào.</p>
          )}
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onSaved={(updated) => onChange(tags.map((t) => (t.id === updated.id ? updated : t)))}
              onDeleted={(id) => onChange(tags.filter((t) => t.id !== id))}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
