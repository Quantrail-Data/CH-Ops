import { cn } from "cn"

function Card({
  className,
  size = "default",
  ...props
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "tw:group/card tw:flex tw:flex-col tw:gap-(--card-spacing) tw:overflow-hidden tw:rounded-xl tw:bg-card tw:py-(--card-spacing) tw:text-sm tw:text-card-foreground tw:ring-1 tw:ring-foreground/10 tw:[--card-spacing:--spacing(4)] tw:has-data-[slot=card-footer]:pb-0 tw:has-[>img:first-child]:pt-0 tw:data-[size=sm]:[--card-spacing:--spacing(3)] tw:data-[size=sm]:has-data-[slot=card-footer]:pb-0 tw:*:[img:first-child]:rounded-t-xl tw:*:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "tw:group/card-header tw:@container/card-header tw:grid tw:auto-rows-min tw:items-start tw:gap-1 tw:rounded-t-xl tw:px-(--card-spacing) tw:has-data-[slot=card-action]:grid-cols-[1fr_auto] tw:has-data-[slot=card-description]:grid-rows-[auto_auto] tw:[.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "tw:font-heading tw:text-base tw:leading-snug tw:font-medium tw:group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("tw:text-sm tw:text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "tw:col-start-2 tw:row-span-2 tw:row-start-1 tw:self-start tw:justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("tw:px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "tw:flex tw:items-center tw:rounded-b-xl tw:border-t tw:bg-muted/50 tw:p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
