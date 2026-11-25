import { cn } from "cn"
import { IconLoader } from "@tabler/icons-react"

function Spinner({
  className,
  ...props
}) {
  return (
    <IconLoader data-slot="spinner" role="status" aria-label="Loading" className={cn("tw:size-4 tw:animate-spin", className)} {...props} />
  )
}

export { Spinner }
