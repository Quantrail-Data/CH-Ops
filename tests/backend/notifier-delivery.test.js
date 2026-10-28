// notifier-delivery.test.js - A refused notification must give an error, not look like a success.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock, afterEach } from "bun:test";

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters: () => [],
}));

const { sendNotification } = await import(
  "../../src/backend/services/notifier.js"
);

const ORIGINAL_FETCH = global.fetch;
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

// Makes fetch answer with one fixed status and body, and keeps each request.
function answerEveryRequestWith(status, body) {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(body), { status });
  };
  return requests;
}

const ALERT = { id: 7, name: "Disk space low", severity: "warning", lastValue: 9 };
const SLACK = { type: "slack", bot_token: "xoxb-test", channel_id: "C123" };
const TEAMS = { type: "teams", webhook_url: "https://example.webhook.office.com/hook" };
const PAGERDUTY = { type: "pagerduty", routing_key: "routing-key" };

describe("sendNotification", () => {
  it("gives an error when Slack refuses the message", async () => {
    answerEveryRequestWith(200, { ok: false, error: "channel_not_found" });
    await expect(sendNotification(SLACK, ALERT)).rejects.toThrow(
      "Slack refused the message: channel_not_found",
    );
  });

  it("gives no error when Slack accepts the message", async () => {
    answerEveryRequestWith(200, { ok: true });
    await expect(sendNotification(SLACK, ALERT)).resolves.toBeUndefined();
  });

  it("gives an error when Teams answers with an error status", async () => {
    answerEveryRequestWith(500, {});
    await expect(sendNotification(TEAMS, ALERT)).rejects.toThrow(
      "Microsoft Teams refused the message: HTTP 500",
    );
  });

  it("gives an error when PagerDuty refuses the event", async () => {
    answerEveryRequestWith(400, { status: "invalid event" });
    await expect(sendNotification(PAGERDUTY, ALERT)).rejects.toThrow(
      "PagerDuty refused the message: HTTP 400",
    );
  });

  it("uses one PagerDuty key for the failure and the recovery of one alert", async () => {
    const requests = answerEveryRequestWith(202, { status: "success" });
    await sendNotification(PAGERDUTY, { ...ALERT, kind: "failure" });
    await sendNotification(PAGERDUTY, { ...ALERT, kind: "recovery" });
    expect(requests.map((request) => request.body.event_action)).toEqual([
      "trigger",
      "resolve",
    ]);
    expect(requests[0].body.dedup_key).toBe(requests[1].body.dedup_key);
  });
});
