"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import type { CustomerTag } from "@prisma/client";
import { createCustomerTagAction } from "@/server/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagBadge } from "@/components/customers/tag-badge";
import { TagManageDialog } from "@/components/customers/tag-manage-dialog";

interface TagMultiselectProps {
  allTags: CustomerTag[];
  defaultSelectedIds?: string[];
}

export function TagMultiselect({ allTags: initialTags, defaultSelectedIds = [] }: TagMultiselectProps) {
  const [tags, setTags] = useState(initialTags);
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds);
  const [newTagName, setNewTagName] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function handleCreate() {
    if (!newTagName.trim()) return;
    startTransition(async () => {
      const tag = await createCustomerTagAction(newTagName.trim());
      setTags((prev) => [...prev, tag]);
      setSelected((prev) => [...prev, tag.id]);
      setNewTagName("");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selected.includes(tag.id);
          return (
            <button
              type="button"
              key={tag.id}
              onClick={() => toggle(tag.id)}
              className={isSelected ? "opacity-100" : "opacity-40 hover:opacity-70"}
            >
              <TagBadge name={tag.name} color={tag.color} />
            </button>
          );
        })}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-6 w-6">
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2">
            <p className="text-sm font-medium">Thêm tag mới</p>
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="VD: Khách sỉ"
            />
            <Button type="button" size="sm" className="w-full" disabled={isPending} onClick={handleCreate}>
              Thêm
            </Button>
          </PopoverContent>
        </Popover>
        <TagManageDialog
          tags={tags}
          onChange={(updatedTags) => {
            setTags(updatedTags);
            setSelected((prev) => prev.filter((id) => updatedTags.some((t) => t.id === id)));
          }}
        />
      </div>
      {selected.map((id) => (
        <input key={id} type="hidden" name="tagIds" value={id} />
      ))}
    </div>
  );
}
