"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Option {
  id: string;
  name: string;
}

interface QuickAddSelectProps {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder: string;
  addLabel: string;
  onCreate: (name: string) => Promise<Option>;
}

export function QuickAddSelect({
  name,
  options: initialOptions,
  defaultValue,
  placeholder,
  addLabel,
  onCreate,
}: QuickAddSelectProps) {
  const [options, setOptions] = useState(initialOptions);
  const [value, setValue] = useState(defaultValue ?? "");
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const created = await onCreate(newName.trim());
      setOptions((prev) => [...prev, created]);
      setValue(created.id);
      setNewName("");
      setOpen(false);
    });
  }

  return (
    <div className="flex gap-2">
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" title={addLabel}>
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2">
          <p className="text-sm font-medium">{addLabel}</p>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nhập tên mới..."
          />
          <Button type="button" size="sm" className="w-full" disabled={isPending} onClick={handleCreate}>
            {isPending ? "Đang thêm..." : "Thêm"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
