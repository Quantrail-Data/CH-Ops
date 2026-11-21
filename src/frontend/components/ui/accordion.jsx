import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { cn } from "cn"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"

function Accordion({
  className,
  ...props
}) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("tw:flex tw:w-full tw:flex-col", className)}
      {...props}
    />
  )
}

function AccordionItem({
  className,
  ...props
}) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("tw:not-last:border-b", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}) {
  return (
    <AccordionPrimitive.Header className="tw:flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "tw:group/accordion-trigger tw:relative tw:flex tw:flex-1 tw:items-start tw:justify-between tw:rounded-lg tw:border tw:border-transparent tw:py-2.5 tw:text-left tw:text-sm tw:font-medium tw:transition-all tw:outline-none tw:hover:underline tw:focus-visible:border-ring tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50 tw:focus-visible:after:border-ring tw:aria-disabled:pointer-events-none tw:aria-disabled:opacity-50 tw:**:data-[slot=accordion-trigger-icon]:ml-auto tw:**:data-[slot=accordion-trigger-icon]:size-4 tw:**:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        <IconChevronDown data-slot="accordion-trigger-icon" className="tw:pointer-events-none tw:shrink-0 tw:group-aria-expanded/accordion-trigger:hidden" />
        <IconChevronUp data-slot="accordion-trigger-icon" className="tw:pointer-events-none tw:hidden tw:shrink-0 tw:group-aria-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="tw:overflow-hidden tw:text-sm tw:data-open:animate-accordion-down tw:data-closed:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "tw:h-(--accordion-panel-height) tw:pt-0 tw:pb-2.5 tw:data-ending-style:h-0 tw:data-starting-style:h-0 tw:[&_a]:underline tw:[&_a]:underline-offset-3 tw:[&_a]:hover:text-foreground tw:[&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
