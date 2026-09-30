"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GAME_OPTIONS } from "@/lib/tcg-games";

interface GameSelectFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
}

const KNOWN_GAMES: readonly string[] = GAME_OPTIONS;

export function GameSelectField({
  id = "game",
  label = "Dòng game (tuỳ chọn)",
  value,
  onChange,
}: GameSelectFieldProps) {
  const isKnown = KNOWN_GAMES.includes(value);
  const [selectValue, setSelectValue] = useState(isKnown ? value : value ? "Khác" : "");
  const [customValue, setCustomValue] = useState(isKnown ? "" : value);

  function handleSelectChange(next: string) {
    setSelectValue(next);
    onChange(next === "Khác" ? customValue : next);
  }

  function handleCustomChange(next: string) {
    setCustomValue(next);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Chọn game" />
        </SelectTrigger>
        <SelectContent>
          {GAME_OPTIONS.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectValue === "Khác" && (
        <Input
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Nhập tên game"
        />
      )}
    </div>
  );
}
