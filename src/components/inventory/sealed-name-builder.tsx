"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GAME_OPTIONS = [
  "Pokémon",
  "One Piece",
  "Yu-Gi-Oh!",
  "Magic: The Gathering",
  "Riftbound",
  "Gundam",
  "Dragon Ball Super",
  "Digimon",
  "Union Arena",
  "Weiss Schwarz",
  "Khác",
];

const BOX_TYPE_OPTIONS = [
  "Booster Box",
  "Elite Trainer Box",
  "Booster Bundle",
  "Case",
  "Blister Booster",
  "Collection Box",
  "Special/Premium Collection",
  "Theme Deck",
  "Structure Deck",
  "Starter Deck",
  "Khác",
];

interface SealedNameBuilderProps {
  onChange: (value: { name: string; game: string; isValid: boolean }) => void;
}

/**
 * Replaces free-text "Tên sản phẩm" entry with a structured builder — the
 * final name is always "[Game] - [Set] - [Loại Box]" so it stays consistent
 * and searchable across the inventory.
 */
export function SealedNameBuilder({ onChange }: SealedNameBuilderProps) {
  const [game, setGame] = useState("");
  const [gameOther, setGameOther] = useState("");
  const [setName, setSetName] = useState("");
  const [boxType, setBoxType] = useState("");
  const [boxTypeOther, setBoxTypeOther] = useState("");

  const finalGame = (game === "Khác" ? gameOther : game).trim();
  const finalBoxType = (boxType === "Khác" ? boxTypeOther : boxType).trim();
  const trimmedSetName = setName.trim();
  const isValid = Boolean(finalGame && trimmedSetName && finalBoxType);
  const composedName = isValid ? `${finalGame} - ${trimmedSetName} - ${finalBoxType}` : "";

  useEffect(() => {
    onChange({ name: composedName, game: finalGame, isValid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composedName, finalGame, isValid]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tên Game</Label>
          <Select value={game} onValueChange={setGame}>
            <SelectTrigger>
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
          {game === "Khác" && (
            <Input
              value={gameOther}
              onChange={(e) => setGameOther(e.target.value)}
              placeholder="Nhập tên game"
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Loại Box</Label>
          <Select value={boxType} onValueChange={setBoxType}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn loại box" />
            </SelectTrigger>
            <SelectContent>
              {BOX_TYPE_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {boxType === "Khác" && (
            <Input
              value={boxTypeOther}
              onChange={(e) => setBoxTypeOther(e.target.value)}
              placeholder="Nhập loại box"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="setName">Tên Set phát hành</Label>
        <Input
          id="setName"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          placeholder="VD: Scarlet & Violet 151, Romance Dawn OP-01"
        />
      </div>

      {isValid ? (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
          Tên sản phẩm chuẩn: <span className="font-medium">{composedName}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Chọn đủ Game + Loại Box và nhập Tên Set để hệ thống tự tạo tên sản phẩm chuẩn.
        </p>
      )}
    </div>
  );
}
