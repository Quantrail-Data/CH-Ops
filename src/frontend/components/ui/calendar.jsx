import * as React from "react"
import { cn } from "cn"
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { Button, buttonVariants } from "@/components/ui/button"
import { IconChevronLeft, IconChevronRight, IconChevronDown } from "@tabler/icons-react"

// These parts are defined here, not inside Calendar. A part defined inside
// Calendar is a new component on each render, so React builds new day
// buttons and the keyboard focus is lost (the arrow keys stop working).
function CalendarRoot({ className, rootRef, ...props }) {
  return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />
}

function CalendarChevron({ className, orientation, ...props }) {
  if (orientation === "left") {
    return <IconChevronLeft className={cn("tw:size-4", className)} {...props} />
  }
  if (orientation === "right") {
    return <IconChevronRight className={cn("tw:size-4", className)} {...props} />
  }
  return <IconChevronDown className={cn("tw:size-4", className)} {...props} />
}

function CalendarWeekNumber({ children, ...props }) {
  return (
    <td {...props}>
      <div className="tw:flex tw:size-(--cell-size) tw:items-center tw:justify-center tw:text-center">
        {children}
      </div>
    </td>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "tw:group/calendar tw:bg-background tw:p-2 tw:[--cell-radius:var(--radius-md)] tw:[--cell-size:--spacing(7)] tw:in-data-[slot=card-content]:bg-transparent tw:in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("tw:w-fit", defaultClassNames.root),
        months: cn(
          "tw:relative tw:flex tw:flex-col tw:gap-4 tw:md:flex-row",
          defaultClassNames.months
        ),
        month: cn("tw:flex tw:w-full tw:flex-col tw:gap-4", defaultClassNames.month),
        nav: cn(
          "tw:absolute tw:inset-x-0 tw:top-0 tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "tw:size-(--cell-size) tw:p-0 tw:select-none tw:aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "tw:size-(--cell-size) tw:p-0 tw:select-none tw:aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "tw:flex tw:h-(--cell-size) tw:w-full tw:items-center tw:justify-center tw:px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "tw:flex tw:h-(--cell-size) tw:w-full tw:items-center tw:justify-center tw:gap-1.5 tw:text-sm tw:font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "tw:relative tw:rounded-(--cell-radius)",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "tw:absolute tw:inset-0 tw:bg-popover tw:opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "tw:font-medium tw:select-none",
          captionLayout === "label"
            ? "tw:text-sm"
            : "tw:flex tw:items-center tw:gap-1 tw:rounded-(--cell-radius) tw:text-sm tw:[&>svg]:size-3.5 tw:[&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn("tw:w-full tw:border-collapse", defaultClassNames.month_grid),
        weekdays: cn("tw:flex", defaultClassNames.weekdays),
        weekday: cn(
          "tw:flex-1 tw:rounded-(--cell-radius) tw:text-[0.8rem] tw:font-normal tw:text-muted-foreground tw:select-none",
          defaultClassNames.weekday
        ),
        week: cn("tw:mt-2 tw:flex tw:w-full", defaultClassNames.week),
        week_number_header: cn(
          "tw:w-(--cell-size) tw:select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "tw:text-[0.8rem] tw:text-muted-foreground tw:select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "tw:group/day tw:relative tw:aspect-square tw:h-full tw:w-full tw:rounded-(--cell-radius) tw:p-0 tw:text-center tw:select-none tw:[&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "tw:[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "tw:[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day
        ),
        range_start: cn(
          "tw:relative tw:isolate tw:z-0 tw:rounded-l-(--cell-radius) tw:bg-muted tw:after:absolute tw:after:inset-y-0 tw:after:right-0 tw:after:w-4 tw:after:bg-muted",
          defaultClassNames.range_start
        ),
        range_middle: cn("tw:rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "tw:relative tw:isolate tw:z-0 tw:rounded-r-(--cell-radius) tw:bg-muted tw:after:absolute tw:after:inset-y-0 tw:after:left-0 tw:after:w-4 tw:after:bg-muted",
          defaultClassNames.range_end
        ),
        today: cn(
          "tw:rounded-(--cell-radius) tw:bg-muted tw:text-foreground tw:data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "tw:text-muted-foreground tw:aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "tw:text-muted-foreground tw:opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("tw:invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}) {
  const defaultClassNames = getDefaultClassNames()

  // Focus this day when the calendar moves the keyboard focus to it.
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "tw:relative tw:isolate tw:z-10 tw:flex tw:aspect-square tw:size-auto tw:w-full tw:min-w-(--cell-size) tw:flex-col tw:gap-1 tw:border-0 tw:leading-none tw:font-normal tw:group-data-[focused=true]/day:relative tw:group-data-[focused=true]/day:z-10 tw:group-data-[focused=true]/day:border-ring tw:group-data-[focused=true]/day:ring-[3px] tw:group-data-[focused=true]/day:ring-ring/50 tw:data-[range-end=true]:rounded-(--cell-radius) tw:data-[range-end=true]:rounded-r-(--cell-radius) tw:data-[range-end=true]:bg-primary tw:data-[range-end=true]:text-primary-foreground tw:data-[range-middle=true]:rounded-none tw:data-[range-middle=true]:bg-muted tw:data-[range-middle=true]:text-foreground tw:data-[range-start=true]:rounded-(--cell-radius) tw:data-[range-start=true]:rounded-l-(--cell-radius) tw:data-[range-start=true]:bg-primary tw:data-[range-start=true]:text-primary-foreground tw:data-[selected-single=true]:bg-primary tw:data-[selected-single=true]:text-primary-foreground tw:dark:hover:text-foreground tw:[&>span]:text-xs tw:[&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
