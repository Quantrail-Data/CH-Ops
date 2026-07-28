// Copyright (C) 2026 Quantrail™ Data Private Limited
// Arithmetic helpers for the Cluster Overview live section.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan
export const NO_VALUE = null;


export function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return NO_VALUE;
  if (denominator === 0) return NO_VALUE;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : NO_VALUE;
}

/** Difference of two readings, null unless both are real numbers. */
export function difference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NO_VALUE;
  return a - b;
}

// Sum of several readings. Null if any is missing.
export function sumOf(values, keys) {
  let total = 0;
  for (const key of keys) {
    const v = values[key];
    if (!Number.isFinite(v)) return NO_VALUE;
    total += v;
  }
  return total;
}

export function toValues(rows, nameColumn, wantedKeys) {
  const values = {};
  const wanted = wantedKeys instanceof Set ? wantedKeys : new Set(wantedKeys);
  for (const row of rows || []) {
    const name = row[nameColumn];
    if (!wanted.has(name)) continue;
    const value = Number(row.value);
    if (Number.isFinite(value)) values[name] = value;
  }
  return values;
}

/** Server-supplied descriptions, keyed by name, for tooltips. */
export function toDescriptions(rows, nameColumn) {
  const out = {};
  for (const row of rows || []) {
    if (row[nameColumn] && row.description) out[row[nameColumn]] = row.description;
  }
  return out;
}

/** Rows in the shape buildChartOption's simple_bar and pie expect. */
export function toCategoryRows(values, pairs) {
  return pairs
    .map(([label, key]) => ({ k: label, v: values[key] ?? 0 }))
    .filter((r) => Number.isFinite(r.v));
}

// Counter helpers, for system.events

export function delta(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return NO_VALUE;
  if (current < previous) return NO_VALUE;
  return current - previous;
}

/** True when any counter went backwards, meaning the server restarted. */
export function detectRestart(previousValues, currentValues, keys) {
  for (const key of keys) {
    const p = previousValues[key];
    const c = currentValues[key];
    if (Number.isFinite(p) && Number.isFinite(c) && c < p) return true;
  }
  return false;
}

/** Seconds between two samples. Null when the pair carries no time. */
export function elapsedSeconds(previous, current) {
  if (!previous || !current) return NO_VALUE;
  const seconds = (current.t - previous.t) / 1000;
  return seconds > 0 ? seconds : NO_VALUE;
}

export function rate(previous, current, key) {
  const seconds = elapsedSeconds(previous, current);
  if (seconds === NO_VALUE) return NO_VALUE;
  const change = delta(previous.values[key] ?? 0, current.values[key] ?? 0);
  if (change === NO_VALUE) return NO_VALUE;
  return change / seconds;
}

/** Per-second rate of the sum of several counters. */
export function rateOfSum(previous, current, keys) {
  const seconds = elapsedSeconds(previous, current);
  if (seconds === NO_VALUE) return NO_VALUE;
  let total = 0;
  for (const key of keys) {
    const change = delta(previous.values[key] ?? 0, current.values[key] ?? 0);
    if (change === NO_VALUE) return NO_VALUE;
    total += change;
  }
  return total / seconds;
}

/** Ratio of two counters over the last interval. */
export function pairRatio(previous, current, numeratorKey, denominatorKey) {
  if (!previous || !current) return NO_VALUE;
  const n = delta(previous.values[numeratorKey] ?? 0, current.values[numeratorKey] ?? 0);
  const d = delta(previous.values[denominatorKey] ?? 0, current.values[denominatorKey] ?? 0);
  if (n === NO_VALUE || d === NO_VALUE) return NO_VALUE;
  return ratio(n, d);
}

/** Ratio where numerator and denominator are each a sum of counters. */
export function pairRatioOfSums(previous, current, numeratorKeys, denominatorKeys) {
  if (!previous || !current) return NO_VALUE;
  const sum = (keys) => {
    let total = 0;
    for (const key of keys) {
      const change = delta(previous.values[key] ?? 0, current.values[key] ?? 0);
      if (change === NO_VALUE) return NO_VALUE;
      total += change;
    }
    return total;
  };
  const n = sum(numeratorKeys);
  const d = sum(denominatorKeys);
  if (n === NO_VALUE || d === NO_VALUE) return NO_VALUE;
  return ratio(n, d);
}

// Thread-equivalents: how many threads were doing something continuously, on average, over the interval.

export function threadEquivalents(previous, current, keys, scale = 1) {
  const seconds = elapsedSeconds(previous, current);
  if (seconds === NO_VALUE) return NO_VALUE;
  let micros = 0;
  for (const key of keys) {
    const change = delta(previous.values[key] ?? 0, current.values[key] ?? 0);
    if (change === NO_VALUE) return NO_VALUE;
    micros += change * scale;
  }
  return micros / (seconds * 1_000_000);
}

/** Wrap a values map with a timestamp, which is what the counter helpers take. */
export function stamp(values) {
  return { t: Date.now(), values };
}
