import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatVND, LUXURY_CARD_CLASS } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "positive" | "negative" | "warning";
  subtitle?: string;
  format?: "currency" | "number";
  glow?: boolean;
  /** Prefix positive values with + (profit/loss figures). */
  signed?: boolean;
  className?: string;
}

const iconToneClasses: Record<string, string> = {
  default: "bg-primary/10 text-primary dark:bg-amber-500/10 dark:text-amber-400",
  positive: "bg-success/10 text-success",
  negative: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  tone = "default",
  subtitle,
  format = "currency",
  glow = false,
  signed = false,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        LUXURY_CARD_CLASS,
        className,
        glow &&
          "border-amber-500/40 shadow-md shadow-amber-500/10 dark:border-amber-500/30 dark:shadow-lg dark:shadow-amber-500/10 dark:hover:border-amber-400/60 dark:hover:shadow-amber-500/20"
      )}
    >
      <CardContent className="flex h-full flex-col gap-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 pt-0.5 text-sm font-medium text-muted-foreground">{title}</p>
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconToneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div
          className={cn(
            "whitespace-nowrap text-xl font-bold tracking-tight tabular-nums xl:text-2xl",
            tone === "positive" && "text-success",
            tone === "negative" && "text-danger",
            tone === "warning" && "text-warning"
          )}
        >
          {signed && value > 0 ? "+" : ""}
          {format === "currency" ? formatVND(value) : value.toLocaleString("vi-VN")}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
