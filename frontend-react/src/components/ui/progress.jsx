import * as React from "react"
import { cn } from "../../lib/utils"

const Progress = React.forwardRef(({ className, value, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
      className
    )}
    {...props}
  >
    <div
      className="h-full w-full flex-1 bg-primary transition-all rounded-full"
      style={{ width: `${Math.min(value || 0, 100)}%` }}
    />
  </div>
))
Progress.displayName = "Progress"

export { Progress }
