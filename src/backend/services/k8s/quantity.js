// quantity.js - Changes a Kubernetes memory value such as "4Gi" into bytes.
// Copyright (C) 2026 Quantrail Data Private Limited

// Ki, Mi, Gi ... are powers of 1024.
const BINARY_UNITS = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
};

// k, M, G ... are powers of 1000.
const DECIMAL_UNITS = {
  k: 1000,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
  P: 1000 ** 5,
};

// Returns the number of bytes, or null when the value is empty or has an unknown format.
export function parseMemoryQuantity(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();

  const binaryMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)(Ki|Mi|Gi|Ti|Pi)$/);
  if (binaryMatch) {
    return Math.round(Number(binaryMatch[1]) * BINARY_UNITS[binaryMatch[2]]);
  }

  const decimalMatch = text.match(/^([0-9]+(?:\.[0-9]+)?)([kKMGTP])$/);
  if (decimalMatch) {
    return Math.round(Number(decimalMatch[1]) * DECIMAL_UNITS[decimalMatch[2]]);
  }

  if (/^[0-9]+$/.test(text)) return Number(text);

  return null;
}
