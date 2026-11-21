"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "cn"

function Progress({
  className,
  children,
  value,
  ...props
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("tw:flex tw:flex-wrap tw:gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "tw:relative tw:flex tw:h-1 tw:w-full tw:items-center tw:overflow-x-hidden tw:rounded-full tw:bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("tw:h-full tw:bg-primary tw:transition-all", className)}
      {...props}
    />
  )
}

function ProgressLabel({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Label
      className={cn("tw:text-sm tw:font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "tw:ml-auto tw:text-sm tw:text-muted-foreground tw:tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
