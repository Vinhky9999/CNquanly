import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatVND } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "positive" | "negative";
  subtitle?: string;
  format?: "currency" | "number";
}

const iconToneClasses: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  positive: "bg-emerald-500/10 text-emerald-600",
  negative: "bg-rose-500/10 text-rose-600",
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
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className={cn(
              "text-2xl font-bold tracking-tight",
              tone === "positive" && "text-emerald-600",
              tone === "negative" && "text-destructive"
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
