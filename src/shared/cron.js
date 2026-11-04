// cron.js - The cron check and the cron match of alert rules.
// The server and the Alert Rules page use this file, so both accept the same schedules.
// Copyright (C) 2026 Quantrail Data Private Limited

// The supported grammar: *, */n, and comma lists. Exactly 5 fields. No ranges.
const FIELD_NAMES = ["minute", "hour", "day-of-month", "month", "day-of-week"];
const FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  // getDay() gives 0 (Sunday) to 6. 7 never matches, so the check refuses it.
  [0, 6],
];

function splitFields(expr) {
  return String(expr || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Returns an error text, or null when the expression is valid.
export function validateCronExpression(expr) {
  const parts = splitFields(expr);
  if (parts.length !== 5) return "Cron must have 5 fields";
  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (part === "*") continue;
    if (part.startsWith("*/")) {
      const step = Number(part.slice(2));
      if (!Number.isInteger(step) || step < 1)
        return `Invalid step in ${FIELD_NAMES[i]}: ${part}`;
      continue;
    }
    for (const value of part.split(",")) {
      const number = value === "" ? NaN : Number(value);
      const [low, high] = FIELD_RANGES[i];
      if (!Number.isInteger(number) || number < low || number > high)
        return `CRON ERROR : ${FIELD_NAMES[i]} must be a number from ${low} to ${high}, or a comma list of numbers: ${value}`;
    }
  }
  return null;
}

// True when the expression runs in the minute of the date (local time).
export function cronMatches(expr, date) {
  if (validateCronExpression(expr)) return false;
  const parts = splitFields(expr);
  const dateFields = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];
  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (part === "*") continue;
    if (part.startsWith("*/")) {
      if (dateFields[i] % Number(part.slice(2)) !== 0) return false;
      continue;
    }
    if (!part.split(",").map(Number).includes(dateFields[i])) return false;
  }
  return true;
}
