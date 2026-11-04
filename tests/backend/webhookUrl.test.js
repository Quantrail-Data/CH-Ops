// webhookUrl.test.js - A webhook URL must not reach this server or a private network.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, mock } from "bun:test";

mock.module("../../src/backend/services/clusterUtils.js", () => ({
  getAllClusters: () => [],
}));

const { isBlockedAddress, validateWebhookUrl } = await import(
  "../../src/backend/services/notifier.js"
);

// One address in each blocked range, and the nearest addresses outside it.
const RANGES = [
  { range: "0.0.0.0/8", inside: ["0.0.0.0", "0.0.0.1", "0.255.255.255"], outside: ["1.0.0.0"] },
  { range: "10.0.0.0/8", inside: ["10.0.0.1", "10.255.255.255"], outside: ["9.255.255.255", "11.0.0.0"] },
  { range: "100.64.0.0/10", inside: ["100.64.0.0", "100.127.255.255"], outside: ["100.63.255.255", "100.128.0.0"] },
  { range: "127.0.0.0/8", inside: ["127.0.0.1", "127.0.0.2", "127.255.255.255"], outside: ["128.0.0.0"] },
  { range: "169.254.0.0/16", inside: ["169.254.169.254"], outside: ["169.253.255.255", "169.255.0.0"] },
  { range: "172.16.0.0/12", inside: ["172.16.0.1", "172.31.255.255"], outside: ["172.15.255.255", "172.32.0.0"] },
  { range: "192.168.0.0/16", inside: ["192.168.1.1"], outside: ["192.167.255.255", "192.169.0.0"] },
  { range: "224.0.0.0/4", inside: ["224.0.0.1", "239.255.255.255"], outside: ["223.255.255.255"] },
  { range: "240.0.0.0/4", inside: ["240.0.0.1", "255.255.255.255"], outside: [] },
  { range: "::/128", inside: ["::"], outside: [] },
  { range: "::1/128", inside: ["::1", "0:0:0:0:0:0:0:1"], outside: ["::2"] },
  { range: "::ffff:0:0/96", inside: ["::ffff:a00:1", "::ffff:10.0.0.1", "::ffff:8.8.8.8"], outside: [] },
  { range: "fc00::/7", inside: ["fc00::1", "fd00::1", "fdff:ffff::1"], outside: ["fbff::1", "fe00::1"] },
  { range: "fe80::/10", inside: ["fe80::1", "febf::1"], outside: ["fec0::1"] },
  { range: "ff00::/8", inside: ["ff02::1"], outside: ["feff::1"] },
];

describe("isBlockedAddress", () => {
  for (const { range, inside, outside } of RANGES) {
    it(`blocks ${range}`, () => {
      for (const address of inside) expect([address, isBlockedAddress(address)]).toEqual([address, true]);
      for (const address of outside) expect([address, isBlockedAddress(address)]).toEqual([address, false]);
    });
  }

  it("allows public addresses", () => {
    for (const address of ["8.8.8.8", "52.96.0.1", "2001:4860:4860::8888"]) {
      expect([address, isBlockedAddress(address)]).toEqual([address, false]);
    }
  });

  it("blocks a text that is not an IP address", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
  });
});

// A DNS answer for the tests. It never asks a real DNS server.
function answerWith(addresses) {
  return async () => addresses;
}

describe("validateWebhookUrl", () => {
  it("refuses an IPv6 literal in brackets", async () => {
    for (const url of ["https://[::1]/hook", "https://[fd00::1]/hook", "https://[fe80::1]/", "https://[::ffff:a00:1]/"]) {
      await expect(validateWebhookUrl(url, { lookupAddresses: answerWith(["8.8.8.8"]) })).rejects.toThrow(
        "private networks, link-local or special addresses",
      );
    }
  });

  it("refuses IPv4 literals in every blocked range", async () => {
    for (const url of ["https://127.0.0.2/", "https://0.0.0.1/", "https://100.64.0.1/", "https://2130706433/"]) {
      await expect(validateWebhookUrl(url)).rejects.toThrow("private networks, link-local or special addresses");
    }
  });

  it("refuses localhost names", async () => {
    for (const url of ["https://localhost/", "https://LOCALHOST./", "https://app.localhost/"]) {
      await expect(validateWebhookUrl(url)).rejects.toThrow("localhost");
    }
  });

  it("refuses a host name that resolves to a private address", async () => {
    const lookupAddresses = answerWith(["52.96.0.1", "10.0.0.5"]);
    await expect(
      validateWebhookUrl("https://hook.example.com/x", { lookupAddresses }),
    ).rejects.toThrow("hook.example.com resolves to 10.0.0.5");
  });

  it("refuses a host name that resolves to an IPv4-mapped address", async () => {
    const lookupAddresses = answerWith(["::ffff:169.254.169.254"]);
    await expect(
      validateWebhookUrl("https://hook.example.com/x", { lookupAddresses }),
    ).rejects.toThrow("private networks, link-local or special addresses");
  });

  it("accepts a host name that resolves only to public addresses and returns the first one", async () => {
    const lookupAddresses = answerWith(["52.96.0.1", "2603:1036::1"]);
    await expect(
      validateWebhookUrl("https://hook.example.com/x", { lookupAddresses }),
    ).resolves.toBe("52.96.0.1");
  });

  it("returns a public IP address in the URL as the checked address", async () => {
    await expect(validateWebhookUrl("https://52.96.0.1/x")).resolves.toBe("52.96.0.1");
  });

  it("refuses a host name that does not resolve before a send", async () => {
    const lookupAddresses = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      validateWebhookUrl("https://missing.example.com/x", { lookupAddresses }),
    ).rejects.toThrow("does not resolve");
  });

  it("lets the channel form save a host name that does not resolve now", async () => {
    const lookupAddresses = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      validateWebhookUrl("https://missing.example.com/x", {
        lookupAddresses,
        allowUnresolvedName: true,
      }),
    ).resolves.toBeNull();
  });

  it("refuses a URL that is not HTTPS", async () => {
    await expect(validateWebhookUrl("http://hook.example.com/x")).rejects.toThrow("HTTPS");
  });
});
