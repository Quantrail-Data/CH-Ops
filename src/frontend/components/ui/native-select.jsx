import { cn } from "cn"
import { IconSelector } from "@tabler/icons-react"

function NativeSelect({
  className,
  size = "default",
  ...props
}) {
  return (
    <div
      className={cn(
        "tw:group/native-select tw:relative tw:w-fit tw:has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="tw:h-8 tw:w-full tw:min-w-0 tw:appearance-none tw:rounded-lg tw:border tw:border-input tw:bg-transparent tw:py-1 tw:pr-8 tw:pl-2.5 tw:text-sm tw:transition-colors tw:outline-none tw:select-none tw:selection:bg-primary tw:selection:text-primary-foreground tw:placeholder:text-muted-foreground tw:focus-visible:border-ring tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:aria-invalid:border-destructive tw:aria-invalid:ring-3 tw:aria-invalid:ring-destructive/20 tw:data-[size=sm]:h-7 tw:data-[size=sm]:rounded-[min(var(--radius-md),10px)] tw:data-[size=sm]:py-0.5 tw:dark:bg-input/30 tw:dark:hover:bg-input/50 tw:dark:aria-invalid:border-destructive/50 tw:dark:aria-invalid:ring-destructive/40"
        {...props}
      />
      <IconSelector className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-2.5 tw:size-4 tw:-translate-y-1/2 tw:text-muted-foreground tw:select-none" aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("tw:bg-[Canvas] tw:text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("tw:bg-[Canvas] tw:text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
