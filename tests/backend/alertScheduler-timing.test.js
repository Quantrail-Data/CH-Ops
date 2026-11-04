// alertScheduler-timing.test.js - Which minutes the alert scheduler checks, and that a rule never runs twice at once.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock } from "bun:test";

mock.module("../../src/backend/db/index.js", () => ({
  db: {},
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  clusters: {},
}));
mock.module("../../src/backend/services/clickhouse.js", () => ({
  executeQuery: async () => ({ rows: [] }),
}));
mock.module("../../src/backend/services/notifier.js", () => ({
  sendNotification: async () => {},
}));
mock.module("../../src/backend/controllers/alerts.js", () => ({
  DecryptValuesChannels: () => ({}),
}));
mock.module("../../src/backend/services/k8sHealthAlerts.js", () => ({
  runK8sHealthAlerts: async () => {},
}));
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getClusterNodes: () => [],
}));

const {
  minutesToCheck,
  isRuleDue,
  runWithoutOverlap,
  MAX_MISSED_MINUTES,
  validateCronExpression: schedulerCronCheck,
} = await import("../../src/backend/services/alertScheduler.js");
const { validateCronExpression: sharedCronCheck } = await import("../../src/shared/cron.js");

describe("cron check", () => {
  it("is the shared check that the Alert Rules page uses", () => {
    expect(schedulerCronCheck).toBe(sharedCronCheck);
    expect(schedulerCronCheck("0 * * *")).toBe("Cron must have 5 fields");
  });
});

// Local time, like the scheduler.
function at(hour, minute, second = 0) {
  return new Date(2026, 10, 4, hour, minute, second);
}

function clock(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

describe("minutesToCheck", () => {
  it("gives only the current minute on the first check", () => {
    expect(minutesToCheck(null, at(10, 5, 30)).map(clock)).toEqual(["10:05"]);
  });

  it("gives every minute after a pause", () => {
    expect(minutesToCheck(at(10, 2), at(10, 5, 10)).map(clock)).toEqual([
      "10:03",
      "10:04",
      "10:05",
    ]);
  });

  it("gives the current minute when a tick comes in the same minute again", () => {
    expect(minutesToCheck(at(10, 5), at(10, 5, 50)).map(clock)).toEqual(["10:05"]);
  });

  it("checks at most the last 10 minutes after a long pause", () => {
    const minutes = minutesToCheck(at(9, 0), at(10, 5, 10));
    expect(MAX_MISSED_MINUTES).toBe(10);
    expect(minutes.length).toBe(10);
    expect(clock(minutes[0])).toBe("9:56");
    expect(clock(minutes[9])).toBe("10:05");
  });

  it("gives the current minute when the clock goes back", () => {
    expect(minutesToCheck(at(10, 30), at(10, 5, 10)).map(clock)).toEqual(["10:05"]);
  });
});

describe("isRuleDue", () => {
  it("runs a rule whose minute was skipped by a pause", () => {
    const rule = { schedule: "4 * * * *", lastRunAt: null };
    const minutes = minutesToCheck(at(10, 3), at(10, 5, 1));
    expect(isRuleDue(rule, minutes)).toBe(true);
  });

  it("does not run a rule that already ran in that minute", () => {
    const rule = { schedule: "*/5 * * * *", lastRunAt: at(10, 5, 2).toISOString() };
    expect(isRuleDue(rule, [at(10, 5)])).toBe(false);
  });

  it("runs a rule that ran in an earlier minute", () => {
    const rule = { schedule: "* * * * *", lastRunAt: at(10, 4, 59).toISOString() };
    expect(isRuleDue(rule, [at(10, 5)])).toBe(true);
  });

  it("does not run a rule whose schedule matches none of the minutes", () => {
    const rule = { schedule: "30 * * * *", lastRunAt: null };
    expect(isRuleDue(rule, minutesToCheck(at(10, 2), at(10, 5)))).toBe(false);
  });
});

describe("runWithoutOverlap", () => {
  it("does not start a second run of a rule that still runs", async () => {
    let endFirstRun;
    let runCount = 0;
    const slowTask = () => {
      runCount += 1;
      return new Promise((resolve) => {
        endFirstRun = resolve;
      });
    };

    const firstRun = runWithoutOverlap(1, slowTask);
    const secondRunStarted = await runWithoutOverlap(1, slowTask);
    expect(secondRunStarted).toBe(false);
    expect(runCount).toBe(1);

    endFirstRun();
    expect(await firstRun).toBe(true);
    expect(await runWithoutOverlap(1, async () => {})).toBe(true);
  });

  it("lets two different rules run at the same time", async () => {
    let endRun;
    const slowTask = () => new Promise((resolve) => (endRun = resolve));
    const ruleOne = runWithoutOverlap(11, slowTask);
    expect(await runWithoutOverlap(12, async () => {})).toBe(true);
    endRun();
    await ruleOne;
  });

  it("frees the rule after a run that fails", async () => {
    await expect(
      runWithoutOverlap(21, async () => {
        throw new Error("query failed");
      }),
    ).rejects.toThrow("query failed");
    expect(await runWithoutOverlap(21, async () => {})).toBe(true);
  });
});
