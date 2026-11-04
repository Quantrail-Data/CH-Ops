// OTPservice.test.js - Limits on the forgot-password codes.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, afterEach, setSystemTime } from "bun:test";
import {
  issueOTP,
  verifyOTP,
  redeemResetToken,
  LIMIT_WINDOW_MS,
  MAX_CODES_PER_WINDOW,
  MAX_WRONG_GUESSES_PER_WINDOW,
} from "../../src/backend/services/OTPservice.js";

const ONE_MINUTE_MS = 60 * 1000;
const START_TIME = new Date("2026-01-01T00:00:00Z").getTime();

let currentTime = START_TIME;
function waitMinutes(minutes) {
  currentTime += minutes * ONE_MINUTE_MS;
  setSystemTime(new Date(currentTime));
}

function startClock() {
  currentTime = START_TIME;
  setSystemTime(new Date(currentTime));
}

// A wrong guess that can never match: a real code has 6 digits.
const WRONG_CODE = "wrong";

afterEach(() => setSystemTime());

describe("forgot-password code limits", () => {
  it("does not give a new code during the wait", () => {
    startClock();
    expect(issueOTP(101)).toBeTruthy();
    expect(issueOTP(101)).toBe(null);
    waitMinutes(2);
    expect(issueOTP(101)).toBeTruthy();
  });

  it("keeps the wait after the code is killed by wrong guesses", () => {
    startClock();
    expect(issueOTP(102)).toBeTruthy();
    for (let i = 0; i < 6; i++) verifyOTP(102, WRONG_CODE);
    // The code is dead now. A new code must still wait.
    expect(issueOTP(102)).toBe(null);
  });

  it("gives at most the daily number of codes", () => {
    startClock();
    for (let i = 0; i < MAX_CODES_PER_WINDOW; i++) {
      expect(issueOTP(103)).toBeTruthy();
      waitMinutes(2);
    }
    expect(issueOTP(103)).toBe(null);
    currentTime = START_TIME + LIMIT_WINDOW_MS + ONE_MINUTE_MS;
    setSystemTime(new Date(currentTime));
    expect(issueOTP(103)).toBeTruthy();
  });

  it("keeps the wrong-guess count across new codes and then locks the account", () => {
    startClock();
    let wrongGuesses = 0;
    while (wrongGuesses < MAX_WRONG_GUESSES_PER_WINDOW) {
      expect(issueOTP(104)).toBeTruthy();
      for (let i = 0; i < 5 && wrongGuesses < MAX_WRONG_GUESSES_PER_WINDOW; i++) {
        verifyOTP(104, WRONG_CODE);
        wrongGuesses++;
      }
      waitMinutes(2);
    }
    // Locked: no new code.
    expect(issueOTP(104)).toBe(null);
  });

  it("refuses the correct code when the account is locked", () => {
    startClock();
    issueOTP(105);
    for (let i = 0; i < 5; i++) verifyOTP(105, WRONG_CODE);
    waitMinutes(2);
    issueOTP(105);
    for (let i = 0; i < 4; i++) verifyOTP(105, WRONG_CODE);
    waitMinutes(2);
    const liveCode = issueOTP(105);
    expect(liveCode).toBeTruthy();
    // This is wrong guess number 10, so the account is locked now.
    verifyOTP(105, WRONG_CODE);
    expect(verifyOTP(105, liveCode).ok).toBe(false);
  });

  it("still accepts the correct code before the limits", () => {
    startClock();
    const code = issueOTP(106);
    verifyOTP(106, WRONG_CODE);
    const result = verifyOTP(106, code);
    expect(result.ok).toBe(true);
    expect(redeemResetToken(result.resetToken)).toBe(106);
  });
});
