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
import { GAME_OPTIONS } from "@/lib/tcg-games";

interface SingleCardNameBuilderProps {
  onChange: (value: { cardName: string; game: string; isValid: boolean }) => void;
}

/**
 * Structured "Tên thẻ" entry for Single cards — 5 discrete fields concatenated
 * into one standardized string on save: "[Dòng game] [Tên Set] [Tên thẻ]
 * [Mã thẻ] [Độ hiếm]" (e.g. "Pokémon 151 Charizard 199 SIR").
 */
export function SingleCardNameBuilder({ onChange }: SingleCardNameBuilderProps) {
  const [game, setGame] = useState("");
  const [gameOther, setGameOther] = useState("");
  const [setCode, setSetCode] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [rarity, setRarity] = useState("");

  const finalGame = (game === "Khác" ? gameOther : game).trim();
  const trimmedSetCode = setCode.trim();
  const trimmedCharacterName = characterName.trim();
  const trimmedCardNumber = cardNumber.trim();
  const trimmedRarity = rarity.trim();

  const isValid = Boolean(
    finalGame && trimmedSetCode && trimmedCharacterName && trimmedCardNumber && trimmedRarity
  );
  const composedName = isValid
    ? `${finalGame} ${trimmedSetCode} ${trimmedCharacterName} ${trimmedCardNumber} ${trimmedRarity}`
    : "";

  useEffect(() => {
    onChange({ cardName: composedName, game: finalGame, isValid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composedName, finalGame, isValid]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dòng game</Label>
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
          <Label htmlFor="setCode">Tên Set</Label>
          <Input
            id="setCode"
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            placeholder="VD: 151, OP-01"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="characterName">Tên thẻ / Nhân vật</Label>
          <Input
            id="characterName"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="VD: Charizard, Luffy"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cardNumber">Mã thẻ</Label>
          <Input
            id="cardNumber"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            placeholder="VD: 199, 001"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rarity">Độ hiếm (Rare)</Label>
          <Input
            id="rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            placeholder="VD: SIR, Manga"
          />
        </div>
      </div>

      {isValid ? (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
          Tên thẻ chuẩn: <span className="font-medium">{composedName}</span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Điền đủ cả 5 trường để hệ thống tự ghép tên thẻ chuẩn.
        </p>
      )}
    </div>
  );
}
