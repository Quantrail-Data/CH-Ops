import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { IconChevronDown, IconX, IconCheck } from "@tabler/icons-react"

const Combobox = ComboboxPrimitive.Root

function ComboboxValue({
  ...props
}) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({
  className,
  children,
  ...props
}) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("tw:[&_svg:not([class*=size-])]:size-4", className)}
      {...props}
    >
      {children}
      <IconChevronDown className="tw:pointer-events-none tw:size-4 tw:text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <IconX className="tw:pointer-events-none" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}) {
  return (
    <InputGroup className={cn("tw:w-auto", className)}>
      <ComboboxPrimitive.Input
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="tw:group-has-data-[slot=combobox-clear]/input-group:hidden tw:data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="tw:isolate tw:z-[10001]"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn("tw: tw: tw:group/combobox-content tw:relative tw:max-h-(--available-height) tw:w-(--anchor-width) tw:max-w-(--available-width) tw:min-w-[calc(var(--anchor-width)+--spacing(7))] tw:origin-(--transform-origin) tw:overflow-hidden tw:rounded-lg tw:bg-popover tw:text-popover-foreground tw:shadow-md tw:ring-1 tw:ring-foreground/10 tw:duration-100 tw:data-[chips=true]:min-w-(--anchor-width) tw:data-[side=bottom]:slide-in-from-top-2 tw:data-[side=inline-end]:slide-in-from-left-2 tw:data-[side=inline-start]:slide-in-from-right-2 tw:data-[side=left]:slide-in-from-right-2 tw:data-[side=right]:slide-in-from-left-2 tw:data-[side=top]:slide-in-from-bottom-2 tw:*:data-[slot=input-group]:m-1 tw:*:data-[slot=input-group]:mb-0 tw:*:data-[slot=input-group]:h-8 tw:*:data-[slot=input-group]:border-input/30 tw:*:data-[slot=input-group]:bg-input/30 tw:*:data-[slot=input-group]:shadow-none tw:data-open:animate-in tw:data-open:fade-in-0 tw:data-open:zoom-in-95 tw:data-closed:animate-out tw:data-closed:fade-out-0 tw:data-closed:zoom-out-95", className )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "tw:no-scrollbar tw:max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] tw:scroll-py-1 tw:overflow-y-auto tw:overscroll-contain tw:p-1 tw:data-empty:p-0",
        className
      )}
      {...props}
    />
  )
}

function ComboboxItem({
  className,
  children,
  ...props
}) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "tw:relative tw:flex tw:w-full tw:cursor-default tw:items-center tw:gap-2 tw:rounded-md tw:py-1 tw:pr-8 tw:pl-1.5 tw:text-sm tw:outline-hidden tw:select-none tw:data-highlighted:bg-accent tw:data-highlighted:text-accent-foreground tw:not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground tw:data-disabled:pointer-events-none tw:data-disabled:opacity-50 tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="tw:pointer-events-none tw:absolute tw:right-2 tw:flex tw:size-4 tw:items-center tw:justify-center" />
        }
      >
        <IconCheck className="tw:pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  )
}

function ComboboxLabel({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("tw:px-2 tw:py-1.5 tw:text-xs tw:text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxCollection({
  ...props
}) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  )
}

function ComboboxEmpty({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "tw:hidden tw:w-full tw:justify-center tw:py-2 tw:text-center tw:text-sm tw:text-muted-foreground tw:group-data-empty/combobox-content:flex",
        className
      )}
      {...props}
    />
  )
}

function ComboboxSeparator({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("tw:-mx-1 tw:my-1 tw:h-px tw:bg-border", className)}
      {...props}
    />
  )
}

function ComboboxChips({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "tw:flex tw:min-h-8 tw:flex-wrap tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:border-input tw:bg-transparent tw:bg-clip-padding tw:px-2.5 tw:py-1 tw:text-sm tw:transition-colors tw:focus-within:border-ring tw:focus-within:ring-3 tw:focus-within:ring-ring/50 tw:has-aria-invalid:border-destructive tw:has-aria-invalid:ring-3 tw:has-aria-invalid:ring-destructive/20 tw:has-data-[slot=combobox-chip]:px-1 tw:dark:bg-input/30 tw:dark:has-aria-invalid:border-destructive/50 tw:dark:has-aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "tw:flex tw:h-[calc(--spacing(5.25))] tw:w-fit tw:items-center tw:justify-center tw:gap-1 tw:rounded-sm tw:bg-muted tw:px-1.5 tw:text-xs tw:font-medium tw:whitespace-nowrap tw:text-foreground tw:has-disabled:pointer-events-none tw:has-disabled:cursor-not-allowed tw:has-disabled:opacity-50 tw:has-data-[slot=combobox-chip-remove]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="tw:-ml-1 tw:opacity-50 tw:hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <IconX className="tw:pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  )
}

function ComboboxChipsInput({
  className,
  ...props
}) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("tw:min-w-16 tw:flex-1 tw:outline-none", className)}
      {...props}
    />
  )
}

function useComboboxAnchor() {
  return React.useRef(null);
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
}
