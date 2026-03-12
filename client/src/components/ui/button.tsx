import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[17px] font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6366F1] focus-visible:ring-offset-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0 transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[#6366F1] text-white hover:bg-[#4F46E5] hover:shadow-[0_6px_20px_rgba(99,102,241,0.35)] border border-[#6366F1]",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border hover:bg-red-700",
        outline:
          "border-2 border-[#18181B] dark:border-[#A1A1AA] text-[#18181B] dark:text-[#F4F4F5] bg-transparent hover:bg-[#F4F4F5] dark:hover:bg-white/10",
        secondary: "border-2 border-[#18181B] dark:border-[#A1A1AA] text-[#18181B] dark:text-[#F4F4F5] bg-transparent hover:bg-[#F4F4F5] dark:hover:bg-white/10",
        ghost: "border border-transparent text-[#6366F1] hover:bg-[#F4F4F5] dark:hover:bg-white/10",
      },
      size: {
        default: "min-h-[52px] px-7 py-4",
        sm: "min-h-[44px] rounded-[10px] px-5 py-2 text-[16px]",
        lg: "min-h-[52px] rounded-[10px] px-8 py-4",
        icon: "h-[44px] w-[44px] min-h-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
