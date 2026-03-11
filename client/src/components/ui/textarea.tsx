import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[120px] w-full rounded-[10px] border-[1.5px] border-[#D4D4D8] bg-background px-4 py-3 text-[17px] text-foreground ring-offset-background placeholder:text-[#71717A] placeholder:text-[17px] focus-visible:outline-none focus-visible:border-[#6366F1] focus-visible:border-2 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
