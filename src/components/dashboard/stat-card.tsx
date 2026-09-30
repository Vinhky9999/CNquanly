import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatVND, LUXURY_CARD_CLASS } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "positive" | "negative";
  subtitle?: string;
  format?: "currency" | "number";
}

const iconToneClasses: Record<string, string> = {
  default: "bg-primary/10 text-primary dark:bg-amber-500/10 dark:text-amber-400",
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  negative: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  tone = "default",
  subtitle,
  format = "currency",
}: StatCardProps) {
  return (
    <Card className={LUXURY_CARD_CLASS}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className={cn(
              "text-2xl font-bold tracking-tight tabular-nums",
              tone === "positive" && "text-emerald-600 dark:text-emerald-400",
              tone === "negative" && "text-destructive dark:text-rose-400"
            )}
          >
            {format === "currency" ? formatVND(value) : value.toLocaleString("vi-VN")}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconToneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
