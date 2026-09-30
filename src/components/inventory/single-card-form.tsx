"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { GradingCompany, SingleCard } from "@prisma/client";
import { Wand2 } from "lucide-react";

import {
  createSingleCardAction,
  updateSingleCardAction,
  createGradingCompanyAction,
  type InventoryActionState,
} from "@/server/actions/inventory";
import {
  searchProductImagesAction,
  type ProductImageSuggestion,
} from "@/server/actions/product-images";
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
import { QuickAddSelect } from "@/components/inventory/quick-add-select";
import { SingleCardNameBuilder } from "@/components/inventory/single-card-name-builder";
import { SingleSkuAutocomplete } from "@/components/inventory/single-sku-autocomplete";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";
import { GameSelectField } from "@/components/inventory/game-select-field";

const GRADE_OPTIONS = [
  "10",
  "9.5",
  "9",
  "8.5",
  "8",
  "7.5",
  "7",
  "6.5",
  "6",
  "5.5",
  "5",
  "4",
  "3",
  "2",
  "1",
];

const initialState: InventoryActionState = {};

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Đang lưu..." : label}
    </Button>
  );
}

interface SingleCardFormProps {
  card?: SingleCard;
  gradingCompanies: GradingCompany[];
}

export function SingleCardForm({ card, gradingCompanies }: SingleCardFormProps) {
  const action = card ? updateSingleCardAction.bind(null, card.id) : createSingleCardAction;
  const [state, formAction] = useFormState(action, initialState);
  const [condition, setCondition] = useState<"RAW" | "GRADED">(card?.condition ?? "RAW");
  const [nameBuilder, setNameBuilder] = useState({ cardName: "", game: "", isValid: false });
  const [editGame, setEditGame] = useState(card?.game ?? "");
  const [imageUrl, setImageUrl] = useState(card?.imageUrl ?? "");
  const [imageSuggestions, setImageSuggestions] = useState<ProductImageSuggestion[]>([]);
  const [hasSearchedImages, setHasSearchedImages] = useState(false);
  const [isSearchingImages, startImageSearch] = useTransition();
  const [imageSearchQuery, setImageSearchQuery] = useState("");

  const suggestedQuery = card ? card.cardName : nameBuilder.cardName;
  const autoFetchGame = card ? editGame : nameBuilder.game;
  const effectiveImageQuery = imageSearchQuery.trim() || suggestedQuery;

  function handleAutoFetchImage() {
    if (!effectiveImageQuery.trim()) return;
    setHasSearchedImages(false);
    startImageSearch(async () => {
      const results = await searchProductImagesAction(effectiveImageQuery, autoFetchGame);
      setImageSuggestions(results);
      setHasSearchedImages(true);
    });
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {!card && <SingleSkuAutocomplete />}

      {card ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="cardName">Tên lá bài</Label>
            <Input id="cardName" name="cardName" defaultValue={card.cardName} required />
          </div>
          <GameSelectField value={editGame} onChange={setEditGame} />
          <input type="hidden" name="game" value={editGame} />
        </>
      ) : (
        <>
          <SingleCardNameBuilder onChange={setNameBuilder} />
          <input type="hidden" name="cardName" value={nameBuilder.cardName} />
          <input type="hidden" name="game" value={nameBuilder.game} />
        </>
      )}

      <div className="space-y-2">
        <Label>Tình trạng</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={condition === "RAW" ? "default" : "outline"}
            onClick={() => setCondition("RAW")}
          >
            Raw
          </Button>
          <Button
            type="button"
            variant={condition === "GRADED" ? "default" : "outline"}
            onClick={() => setCondition("GRADED")}
          >
            Graded
          </Button>
        </div>
        <input type="hidden" name="condition" value={condition} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="grade">Điểm số (tuỳ chọn)</Label>
        <Select name="grade" defaultValue={card?.grade != null ? String(card.grade) : "NONE"}>
          <SelectTrigger id="grade">
            <SelectValue placeholder="Chưa chấm điểm" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">— Chưa chấm điểm —</SelectItem>
            {GRADE_OPTIONS.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {condition === "RAW" ? (
        <div className="space-y-2">
          <Label htmlFor="rawGrade">Hạng Raw</Label>
          <Select name="rawGrade" defaultValue={card?.rawGrade ?? undefined}>
            <SelectTrigger id="rawGrade">
              <SelectValue placeholder="Chọn hạng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="S">S</SelectItem>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Hãng chấm điểm</Label>
            <QuickAddSelect
              name="gradingCompanyId"
              options={gradingCompanies}
              defaultValue={card?.gradingCompanyId ?? undefined}
              placeholder="Chọn hãng"
              addLabel="Thêm hãng chấm điểm mới"
              onCreate={createGradingCompanyAction}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="certNumber">Mã Cert</Label>
            <Input id="certNumber" name="certNumber" defaultValue={card?.certNumber ?? ""} />
          </div>
        </div>
      )}

      {!card && condition === "RAW" ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="costPrice">Giá nhập</Label>
            <Input
              id="costPrice"
              name="costPrice"
              type="number"
              min={0}
              step="1000"
              onFocus={(e) => e.currentTarget.select()}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Số lượng thẻ</Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              onFocus={(e) => e.currentTarget.select()}
              required
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="costPrice">Giá nhập</Label>
          <Input
            id="costPrice"
            name="costPrice"
            type="number"
            min={0}
            step="1000"
            defaultValue={card ? Number(card.costPrice) : undefined}
            onFocus={(e) => e.currentTarget.select()}
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="imageUrl">Hình ảnh lá bài (URL)</Label>
        <div className="flex items-start gap-3">
          <ProductThumbnail src={imageUrl} alt={card?.cardName ?? "Lá bài"} size="md" />
          <div className="flex-1 space-y-2">
            <Input
              id="imageUrl"
              name="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... (nhập tay hoặc dùng Tự động lấy ảnh bên dưới)"
            />
            <div className="flex gap-2">
              <Input
                value={imageSearchQuery}
                onChange={(e) => setImageSearchQuery(e.target.value)}
                placeholder={suggestedQuery || "Từ khoá tìm ảnh, VD: Charizard"}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSearchingImages || !effectiveImageQuery.trim()}
                onClick={handleAutoFetchImage}
              >
                <Wand2 className="h-4 w-4" />
                {isSearchingImages ? "Đang tìm..." : "Tự động lấy ảnh"}
              </Button>
            </div>
            {imageSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-border/60 p-2">
                {imageSuggestions.map((s) => (
                  <button
                    key={s.url}
                    type="button"
                    title={s.label}
                    onClick={() => {
                      setImageUrl(s.url);
                      setImageSuggestions([]);
                      setHasSearchedImages(false);
                    }}
                    className="overflow-hidden rounded-md border border-border/60 transition hover:border-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.url} alt={s.label} className="h-14 w-14 object-cover" />
                  </button>
                ))}
              </div>
            )}
            {hasSearchedImages && imageSuggestions.length === 0 && !isSearchingImages && (
              <p className="text-xs text-muted-foreground">
                Không tìm thấy ảnh phù hợp — vui lòng nhập URL ảnh thủ công.
              </p>
            )}
          </div>
        </div>
      </div>

      {!card && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
          <input
            type="checkbox"
            id="skipCashLedger"
            name="skipCashLedger"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <Label htmlFor="skipCashLedger" className="font-normal leading-snug">
            Hàng có sẵn (Không đồng bộ trừ tiền vào Dòng Tiền)
          </Label>
        </div>
      )}
      {state.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}
      <SubmitButton label={card ? "Lưu thay đổi" : "Thêm lá bài"} disabled={!card && !nameBuilder.isValid} />
    </form>
  );
}
