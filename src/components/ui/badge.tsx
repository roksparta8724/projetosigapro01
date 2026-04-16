import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:shrink-0 [&_svg]:text-current [&_svg]:stroke-current",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80 dark:bg-[#1c4f80] dark:text-slate-50 dark:hover:bg-[#236099]",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-white/[0.08] dark:text-slate-100 dark:hover:bg-white/[0.12]",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 dark:bg-red-500/18 dark:text-red-200 dark:hover:bg-red-500/24",
        outline: "text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
