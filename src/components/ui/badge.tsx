import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-800 text-slate-300",
        secondary:
          "border-transparent bg-slate-700/50 text-slate-400 border-slate-600",
        success:
          "border-green-500/20 bg-green-500/10 text-green-400",
        warning:
          "border-amber-500/20 bg-amber-500/10 text-amber-400",
        destructive:
          "border-red-500/20 bg-red-500/10 text-red-400",
        info:
          "border-blue-500/20 bg-blue-500/10 text-blue-400",
        purple:
          "border-purple-500/20 bg-purple-500/10 text-purple-400",
        outline:
          "text-slate-400 border-slate-600 bg-slate-700/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
