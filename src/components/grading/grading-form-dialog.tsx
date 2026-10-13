"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import type { GradingSubmission } from "@prisma/client";

import {
  createGradingAction,
  updateGradingAction,
  type GradingActionState,
} from "@/server/actions/grading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRADING_COMPANIES, GRADING_STATUSES, GRADING_TIERS, gradingStatusLabel } from "@/lib/grading";
import { formatVND } from "@/lib/utils";

const initialState: GradingActionState = {};
const OTHER = "Khác";

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo đơn chấm điểm"}
    </Button>
  );
}

type Submission = Omit<GradingSubmission, "listedFee" | "costPrice" | "markup" | "chargeAmount"> & {
  listedFee: unknown;
  costPrice: unknown;
  markup: unknown;
  chargeAmount: unknown;
};

interface GradingFormDialogProps {
  submission?: Submission;
  onSuccess?: () => void;
}

export function GradingFormDialog({ submission, onSuccess }: GradingFormDialogProps) {
  const editing = Boolean(submission);
  const [open, setOpen] = useState(false);

  const action = submission ? updateGradingAction.bind(null, submission.id) : createGradingAction;
  const [state, formAction] = useFormState(action, initialState);

  const knownCompany = submission && (GRADING_COMPANIES as readonly string[]).includes(submission.company);
  const [companyChoice, setCompanyChoice] = useState<string>(
    submission ? (knownCompany ? submission.company : OTHER) : "PSA"
  );
  const [customCompany, setCustomCompany] = useState(submission && !knownCompany ? submission.company : "");
  const [status, setStatus] = useState<string>(submission?.status ?? "PENDING_SEND");
  const [listedFee, setListedFee] = useState(submission ? String(Number(submission.listedFee)) : "");
  const [costPrice, setCostPrice] = useState(submission ? String(Number(submission.costPrice)) : "");
  const [markup, setMarkup] = useState(submission ? String(Number(submission.markup)) : "");
  const [costTouched, setCostTouched] = useState(editing);

  const company = companyChoice === OTHER ? customCompany.trim() : companyChoice;
  const tiers = GRADING_TIERS[companyChoice] ?? GRADING_TIERS[OTHER];
  const charge = (Number(costPrice) || 0) + (Number(markup) || 0);
  const profit = Number(markup) || 0;

  useEffect(() => {
    if (state.success) {
      toast.success(editing ? "Đã cập nhật đơn chấm điểm" : "Đã tạo đơn chấm điểm");
      setOpen(false);
      onSuccess?.();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button size="icon" variant="ghost">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="h-10">
            <Plus className="h-4 w-4" />
            Tạo đơn chấm điểm
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa đơn chấm điểm" : "Tạo đơn gửi chấm điểm"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="company" value={company} />
          <input type="hidden" name="status" value={status} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customerName">Tên khách hàng</Label>
              <Input id="customerName" name="customerName" defaultValue={submission?.customerName ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerContact">Liên hệ (SĐT / Zalo / FB)</Label>
              <Input id="customerContact" name="customerContact" defaultValue={submission?.customerContact ?? ""} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cardName">Tên thẻ</Label>
              <Input id="cardName" name="cardName" defaultValue={submission?.cardName ?? ""} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU / Mã</Label>
                <Input id="sku" name="sku" defaultValue={submission?.sku ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Số lượng thẻ</Label>
                <Input id="quantity" name="quantity" type="number" min={1} defaultValue={submission?.quantity ?? 1} required />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Hãng chấm điểm</Label>
              <Select value={companyChoice} onValueChange={setCompanyChoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADING_COMPANIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companyChoice === OTHER && (
                <Input
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  placeholder="Tên hãng"
                  required
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tier">Gói chấm điểm</Label>
              <Input
                id="tier"
                name="tier"
                list="grading-tier-options"
                defaultValue={submission?.tier ?? ""}
                key={companyChoice}
                placeholder="Regular, Express..."
                required
              />
              <datalist id="grading-tier-options">
                {tiers.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Trạng thái</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {gradingStatusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="listedFee">Phí niêm yết hãng (₫)</Label>
                <Input
                  id="listedFee"
                  name="listedFee"
                  type="number"
                  min={0}
                  step="1000"
                  value={listedFee}
                  onChange={(e) => {
                    setListedFee(e.target.value);
                    if (!costTouched) setCostPrice(e.target.value);
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="costPrice">Giá gốc thực tế (₫)</Label>
                <Input
                  id="costPrice"
                  name="costPrice"
                  type="number"
                  min={0}
                  step="1000"
                  value={costPrice}
                  onChange={(e) => {
                    setCostTouched(true);
                    setCostPrice(e.target.value);
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="markup">Lãi dịch vụ (₫)</Label>
                <Input
                  id="markup"
                  name="markup"
                  type="number"
                  min={0}
                  step="1000"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Giá gốc = phí hãng + vận chuyển/bảo hiểm (tổng cả đơn). Khách phải trả{" "}
              <span className="font-semibold text-foreground">{formatVND(charge)}</span> · lãi dịch vụ{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatVND(profit)}</span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="certNumber">Số Cert / Serial (nếu đã có)</Label>
              <Input id="certNumber" name="certNumber" defaultValue={submission?.certNumber ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input id="notes" name="notes" defaultValue={submission?.notes ?? ""} />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Đồng bộ Dòng tiền</p>
            {!submission?.incomeEntryId && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="collectPayment" defaultChecked={!editing} className="h-4 w-4 accent-emerald-500" />
                Đã thu tiền khách — ghi khoản Thu vào Dòng tiền
              </label>
            )}
            {!submission?.costEntryId && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="payCost" className="h-4 w-4 accent-rose-500" />
                Đã trả phí gốc cho hãng — ghi khoản Chi vào Dòng tiền
              </label>
            )}
            {submission?.incomeEntryId && submission?.costEntryId && (
              <p className="text-xs text-muted-foreground">
                Đã ghi nhận đủ thu/chi — sửa số tiền ở đây sẽ tự cập nhật các dòng trong Dòng tiền.
              </p>
            )}
          </div>

          <SubmitButton editing={editing} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
