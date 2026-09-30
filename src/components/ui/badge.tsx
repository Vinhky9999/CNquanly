import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary text-primary-foreground shadow-sm hover:bg-primary/80",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-destructive/20 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80",
        outline: "border-border text-foreground",
        success:
          "border-emerald-500/20 bg-emerald-100 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400",
        warning:
          "border-amber-500/20 bg-amber-100 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400",
        indigo:
          "border-indigo-500/20 bg-indigo-100 text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/15 dark:text-indigo-400",
        rose: "border-rose-500/20 bg-rose-100 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-400",
        slate:
          "border-slate-400/20 bg-slate-200 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/20 dark:text-slate-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
