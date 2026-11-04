// webhookPost.test.js - the webhook send connects to the checked address and does not ask DNS again.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postJsonToAddress } from "../../src/backend/services/webhookPost.js";

// "hooks.test" has no DNS entry. A send can reach the server only through the checked address.
const HOOK_NAME = "hooks.test";
let server;
let port;
let certificate;
const received = [];

beforeAll(async () => {
  const folder = mkdtempSync(join(tmpdir(), "chops-webhook-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-keyout", join(folder, "key.pem"), "-out", join(folder, "cert.pem"),
    "-subj", `/CN=${HOOK_NAME}`, "-addext", `subjectAltName=DNS:${HOOK_NAME}`,
  ], { stdio: "ignore" });
  certificate = readFileSync(join(folder, "cert.pem"));

  server = https.createServer(
    { key: readFileSync(join(folder, "key.pem")), cert: certificate },
    (request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        received.push({ path: request.url, host: request.headers.host, body });
        if (request.url === "/moved") {
          response.writeHead(302, { Location: "https://169.254.169.254/" });
          response.end();
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

afterAll(() => server?.close());

describe("postJsonToAddress", () => {
  it("sends the JSON body to the checked address, with the URL host name", async () => {
    const answer = await postJsonToAddress(
      `https://${HOOK_NAME}:${port}/hook?x=1`,
      "127.0.0.1",
      { text: "alert" },
      { ca: certificate },
    );
    expect(answer.status).toBe(200);
    expect(answer.ok).toBe(true);
    expect(await answer.json()).toEqual({ ok: true });
    const last = received.at(-1);
    expect(last.path).toBe("/hook?x=1");
    expect(last.host).toBe(`${HOOK_NAME}:${port}`);
    expect(JSON.parse(last.body)).toEqual({ text: "alert" });
  });

  it("checks the certificate against the URL host name", async () => {
    await expect(
      postJsonToAddress(`https://other.test:${port}/hook`, "127.0.0.1", {}, { ca: certificate }),
    ).rejects.toThrow();
  });

  it("does not follow a redirect", async () => {
    const before = received.length;
    const answer = await postJsonToAddress(
      `https://${HOOK_NAME}:${port}/moved`,
      "127.0.0.1",
      {},
      { ca: certificate },
    );
    expect(answer.status).toBe(302);
    expect(answer.ok).toBe(false);
    expect(received.length).toBe(before + 1);
  });
});
