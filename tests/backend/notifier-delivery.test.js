// notifier-delivery.test.js - A refused notification must give an error, not look like a success.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock, afterEach } from "bun:test";

let clusterList = [];
mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters: () => clusterList,
}));

// The webhook check asks DNS. In the tests every name resolves to one public address.
mock.module("node:dns", () => ({
  default: { promises: { lookup: async () => [{ address: "52.96.0.1", family: 4 }] } },
}));

// Google Chat and Teams send through webhookPost.js, to the checked address.
let webhookAnswer = { status: 200, body: {} };
let webhookRequests = [];
mock.module("../../src/backend/services/webhookPost.js", () => ({
  postJsonToAddress: async (url, address, body) => {
    webhookRequests.push({ url, address, body });
    return {
      status: webhookAnswer.status,
      ok: webhookAnswer.status >= 200 && webhookAnswer.status < 300,
      json: async () => webhookAnswer.body,
    };
  },
}));

const { sendNotification } = await import(
  "../../src/backend/services/notifier.js"
);

const ORIGINAL_FETCH = global.fetch;
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  clusterList = [];
  webhookRequests = [];
});

// Makes fetch and the webhook send answer with one fixed status and body.
// Returns the fetch requests. The webhook requests are in webhookRequests.
function answerEveryRequestWith(status, body, headers = {}) {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, redirect: options.redirect, body: JSON.parse(options.body) });
    return new Response(JSON.stringify(body), { status, headers });
  };
  webhookAnswer = { status, body };
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

const GOOGLE_CHAT = { type: "google_chat", webhook_url: "https://chat.googleapis.com/v1/spaces/x" };

describe("redirects", () => {
  for (const [label, channel] of [
    ["Slack", SLACK],
    ["PagerDuty", PAGERDUTY],
  ]) {
    it(`does not follow a redirect from ${label}`, async () => {
      const requests = answerEveryRequestWith(302, {}, { Location: "http://169.254.169.254/" });
      await expect(sendNotification(channel, ALERT)).rejects.toThrow(
        `${label} answered with a redirect (HTTP 302)`,
      );
      expect(requests.length).toBe(1);
      expect(requests[0].redirect).toBe("manual");
    });
  }

  // webhookPost.js never follows a redirect. tests/net/webhookPost.test.js checks that.
  for (const [label, channel] of [
    ["Google Chat", GOOGLE_CHAT],
    ["Microsoft Teams", TEAMS],
  ]) {
    it(`gives an error when ${label} answers with a redirect`, async () => {
      answerEveryRequestWith(302, {});
      await expect(sendNotification(channel, ALERT)).rejects.toThrow(
        `${label} answered with a redirect (HTTP 302)`,
      );
      expect(webhookRequests.length).toBe(1);
    });
  }
});

describe("DNS rebinding", () => {
  for (const [label, channel] of [
    ["Google Chat", GOOGLE_CHAT],
    ["Microsoft Teams", TEAMS],
  ]) {
    it(`sends ${label} to the address that the check accepted`, async () => {
      answerEveryRequestWith(200, {});
      await sendNotification(channel, ALERT);
      expect(webhookRequests).toHaveLength(1);
      expect(webhookRequests[0].url).toBe(channel.webhook_url);
      expect(webhookRequests[0].address).toBe("52.96.0.1");
    });
  }
});

describe("webhook check before each send", () => {
  it("refuses a Teams webhook on a private address and sends nothing", async () => {
    answerEveryRequestWith(200, {});
    const privateTeams = { type: "teams", webhook_url: "https://[fd00::1]/hook" };
    await expect(sendNotification(privateTeams, ALERT)).rejects.toThrow(
      "private networks, link-local or special addresses",
    );
    expect(webhookRequests.length).toBe(0);
  });
});

describe("unknown channel type", () => {
  it("gives an error and sends nothing", async () => {
    const requests = answerEveryRequestWith(200, {});
    await expect(sendNotification({ type: "webhook" }, ALERT)).rejects.toThrow(
      "Unknown channel type: webhook",
    );
    expect(requests.length).toBe(0);
  });
});

describe("cluster name in a message", () => {
  const CLUSTERS = [
    { id: "first", name: "first cluster", nodes: [{ host: "a" }] },
    { id: "second", name: "second cluster", nodes: [{ host: "b" }] },
  ];

  function clusterField(requests) {
    const fields = requests[0].body.attachments[0].blocks[1].fields;
    return fields.find((field) => field.text.startsWith("*Cluster:*")).text;
  }

  it("names the cluster of the rule", async () => {
    clusterList = CLUSTERS;
    const requests = answerEveryRequestWith(200, { ok: true });
    await sendNotification(SLACK, { ...ALERT, clusterId: "second" });
    expect(clusterField(requests)).toBe("*Cluster:* second cluster");
  });

  it("says that a rule with no cluster uses the first cluster", async () => {
    clusterList = CLUSTERS;
    const requests = answerEveryRequestWith(200, { ok: true });
    await sendNotification(SLACK, ALERT);
    expect(clusterField(requests)).toBe(
      "*Cluster:* No cluster set (first cluster used: first cluster)",
    );
  });

  it("does not name another cluster when the cluster of the rule is gone", async () => {
    clusterList = CLUSTERS;
    const requests = answerEveryRequestWith(200, { ok: true });
    await sendNotification(SLACK, { ...ALERT, clusterId: "deleted" });
    expect(clusterField(requests)).toBe("*Cluster:* Unknown cluster (deleted)");
  });
});
