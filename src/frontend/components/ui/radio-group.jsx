"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "cn"

function RadioGroup({
  className,
  ...props
}) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("tw:grid tw:w-full tw:gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "tw:group/radio-group-item tw:peer tw:relative tw:flex tw:aspect-square tw:size-4 tw:shrink-0 tw:rounded-full tw:border tw:border-input tw:outline-none tw:group-has-[:focus-visible]/field-label:ring-0 tw:group-has-[:focus-visible]/field-label:not-data-checked:border-input tw:after:absolute tw:after:-inset-x-3 tw:after:-inset-y-2 tw:focus-visible:border-ring tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:aria-invalid:border-destructive tw:aria-invalid:ring-3 tw:aria-invalid:ring-destructive/20 tw:aria-invalid:aria-checked:border-primary tw:dark:bg-input/30 tw:dark:aria-invalid:border-destructive/50 tw:dark:aria-invalid:ring-destructive/40 tw:data-checked:border-primary tw:data-checked:bg-primary tw:data-checked:text-primary-foreground tw:group-has-[:focus-visible]/field-label:data-checked:border-primary tw:dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="tw:flex tw:size-4 tw:items-center tw:justify-center"
      >
        <span className="tw:absolute tw:top-1/2 tw:left-1/2 tw:size-2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-full tw:bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
