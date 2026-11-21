// The shortest number of steps from one slide to another in a loop of
// slideCount slides: 1 is one step forward, -1 is one step back.
// Example: in a loop of 10 slides, from slide 9 to slide 0 is 1 step forward.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
export function stepsBetween(fromIndex, toIndex, slideCount) {
  let steps = (toIndex - fromIndex) % slideCount;
  if (steps > slideCount / 2) steps -= slideCount;
  if (steps < -slideCount / 2) steps += slideCount;
  return steps;
}
