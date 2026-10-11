"use client";

import { useState } from "react";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImportTemplates, type ImportTemplate } from "@/lib/import-templates";

interface TemplatePickerProps {
  kind: "SEALED" | "SINGLE";
  /** Reads the form's current configuration so it can be saved as a new template. */
  getCurrent: () => Omit<ImportTemplate, "id" | "name" | "kind">;
  onApply: (template: ImportTemplate) => void;
}

export function TemplatePicker({ kind, getCurrent, onApply }: TemplatePickerProps) {
  const { templates, save, remove } = useImportTemplates();
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");

  const options = templates.filter((t) => t.kind === kind);

  function handleSelect(id: string) {
    setSelectedId(id);
    const template = templates.find((t) => t.id === id);
    if (template) onApply(template);
  }

  function handleSave() {
    const name = newName.trim();
    if (!name) return;
    const created = save({ ...getCurrent(), name, kind });
    setSelectedId(created.id);
    setNewName("");
    setSaving(false);
    toast.success(`Đã lưu template "${name}"`);
  }

  function handleDelete() {
    if (!selectedId) return;
    const template = templates.find((t) => t.id === selectedId);
    if (!template || !confirm(`Xoá template "${template.name}"?`)) return;
    remove(selectedId);
    setSelectedId("");
    toast.success("Đã xoá template");
  }

  return (
    <div className="space-y-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3 backdrop-blur-xl">
      <Label>Template mẫu (điền sẵn các trường)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder={options.length ? "Chọn template..." : "Chưa có template"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={() => setSaving((v) => !v)}>
          <BookmarkPlus className="h-4 w-4" />
          Lưu thành template
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          disabled={!selectedId}
          title="Xoá template đang chọn"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {saving && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="Tên template, VD: Pokémon - Sealed - ETB"
            className="h-10 min-w-[220px] flex-1"
          />
          <Button type="button" className="h-10" disabled={!newName.trim()} onClick={handleSave}>
            Lưu
          </Button>
        </div>
      )}
    </div>
  );
}
