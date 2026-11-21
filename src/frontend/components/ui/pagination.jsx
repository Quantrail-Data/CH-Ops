import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { IconChevronLeft, IconChevronRight, IconDots } from "@tabler/icons-react"

function Pagination({
  className,
  ...props
}) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("tw:mx-auto tw:flex tw:w-full tw:justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("tw:flex tw:items-center tw:gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({
  ...props
}) {
  return <li data-slot="pagination-item" {...props} />
}

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}) {
  return (
    <Button
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a
          aria-current={isActive ? "page" : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
        />
      }
    />
  )
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("tw:pl-1.5!", className)}
      {...props}
    >
      <IconChevronLeft data-icon="inline-start" />
      <span className="tw:hidden tw:sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("tw:pr-1.5!", className)}
      {...props}
    >
      <span className="tw:hidden tw:sm:block">{text}</span>
      <IconChevronRight data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "tw:flex tw:size-8 tw:items-center tw:justify-center tw:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      <IconDots
      />
      <span className="tw:sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
