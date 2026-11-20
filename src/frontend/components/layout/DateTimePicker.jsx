// DateTimePicker: one field that shows the date and time, for example
// "13 Nov 2026, 10:18:34". A click opens a calendar (shadcn Calendar) and a
// time field. The value is a string "YYYY-MM-DD HH:MM:SS", as before.
// onChange(value, name) is called with the new string.
// valueFormat="datetime-local" gives "YYYY-MM-DDTHH:MM" instead (no seconds),
// the format of the browser datetime-local field, for pages that used it.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useId, useMemo, useRef, useState } from "react";
import { Calendar } from "../ui/calendar.jsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.jsx";
import { IconCalendar } from "@tabler/icons-react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function padTwo(number) {
  return String(number).padStart(2, "0");
}

// Splits "YYYY-MM-DD HH:MM:SS" into its parts. No value gives the current
// date and time with 00 seconds, as the old picker did.
export function parseDateTime(value) {
  if (!value) {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`,
      time: `${padTwo(now.getHours())}:${padTwo(now.getMinutes())}:00`,
    };
  }
  const [date = "", time = ""] = value.split(/[T ]/);
  const [hour = "00", minute = "00", second = "00"] = time.split(":");
  return { date, time: `${padTwo(hour)}:${padTwo(minute)}:${padTwo(second)}` };
}

// "2026-11-13" and "10:18:34" -> "13 Nov 2026, 10:18:34". The same text in
// every browser language, so the field width does not change.
export function formatDateTime(date, time) {
  const [year, month, day] = date.split("-");
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!year || !monthName || !day) return time;
  return `${day} ${monthName} ${year}, ${time}`;
}

// "2026-11-13" -> a Date at local midnight (for the calendar).
function toCalendarDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

// A Date from the calendar -> "2026-11-13".
function fromCalendarDate(calendarDate) {
  return `${calendarDate.getFullYear()}-${padTwo(calendarDate.getMonth() + 1)}-${padTwo(calendarDate.getDate())}`;
}

export function DateTimePicker({ value, onChange, label, name, valueFormat = "seconds" }) {
  const hasSeconds = valueFormat !== "datetime-local";
  const fieldId = useId();
  const timeFieldId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef(null);
  const parts = useMemo(() => parseDateTime(value), [value]);
  const selectedDate = toCalendarDate(parts.date);
  const shownTime = hasSeconds ? parts.time : parts.time.slice(0, 5);
  const shownText = formatDateTime(parts.date, shownTime);

  // When the calendar opens, focus the selected day (or today), so the arrow
  // keys move between days at once.
  function findDayToFocus() {
    const popup = popupRef.current;
    const dayButton =
      popup?.querySelector('[data-selected="true"] button') ||
      popup?.querySelector('[data-today="true"] button');
    return dayButton || true;
  }

  function sendChange(date, time) {
    if (hasSeconds) onChange(`${date} ${time}`, name);
    else onChange(`${date}T${time.slice(0, 5)}`, name);
  }

  function onDateSelect(calendarDate) {
    if (!calendarDate) return;
    sendChange(fromCalendarDate(calendarDate), parts.time);
  }

  function onTimeChange(event) {
    // The time field gives "HH:MM" when the seconds are 0.
    const [hour = "00", minute = "00", second = "00"] = event.target.value.split(":");
    if (!event.target.value) return;
    sendChange(parts.date, `${hour}:${minute}:${second}`);
  }

  return (
    <div className="form-group datetime-field">
      {label && (
        <label className="form-label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          id={fieldId}
          className="form-input datetime-trigger"
          aria-haspopup="dialog"
        >
          <IconCalendar className="datetime-icon" size="1em" stroke={1.5} aria-hidden="true" />
          <span>{shownText}</span>
        </PopoverTrigger>
        <PopoverContent
          ref={popupRef}
          align="start"
          className="datetime-popover tw:w-auto"
          initialFocus={findDayToFocus}
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={onDateSelect}
            captionLayout="dropdown"
          />
          <div className="datetime-time-row">
            <label className="form-label" htmlFor={timeFieldId}>
              Time
            </label>
            <input
              id={timeFieldId}
              type="time"
              step={hasSeconds ? "1" : "60"}
              className="form-input datetime-time"
              value={shownTime}
              onChange={onTimeChange}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DateTimePicker;
