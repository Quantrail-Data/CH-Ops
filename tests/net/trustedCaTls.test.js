// trustedCaTls.test.js - the TLS behaviour the certificate authority feature relies on
// Copyright (C) 2026 Quantrail™ Data Private Limited


import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import tls from "node:tls";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let caPem, caPem2, server, port;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "tls-"));
  const p = (f) => join(dir, f);

  // An authority, and a server certificate it signs.
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", p("ca.key"), "-out", p("ca.crt"), "-days", "365",
    "-subj", "/CN=Test Internal CA"], { stdio: "ignore" });

  execFileSync("openssl", ["req", "-newkey", "rsa:2048", "-nodes",
    "-keyout", p("srv.key"), "-out", p("srv.csr"),
    "-subj", "/CN=localhost"], { stdio: "ignore" });

  writeFileSync(p("san.ext"), "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\n");

  execFileSync("openssl", ["x509", "-req", "-in", p("srv.csr"),
    "-CA", p("ca.crt"), "-CAkey", p("ca.key"), "-CAcreateserial",
    "-out", p("srv.crt"), "-days", "365", "-extfile", p("san.ext")], { stdio: "ignore" });

  // A second, unrelated authority, to prove a bundle works.
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", p("ca2.key"), "-out", p("ca2.crt"), "-days", "365",
    "-subj", "/CN=Other CA"], { stdio: "ignore" });

  caPem = readFileSync(p("ca.crt"), "utf8");
  caPem2 = readFileSync(p("ca2.crt"), "utf8");

  server = https.createServer(
    { key: readFileSync(p("srv.key")), cert: readFileSync(p("srv.crt")) },
    (req, res) => res.end("ok"),
  );
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

afterAll(() => { server?.close(); });

describe("supplying a certificate authority", () => {
  it("fails without one, which is the bug this feature fixes", async () => {
    // The exact error a user reports: "unable to verify the first certificate".
    await expect(fetch(`https://localhost:${port}/`)).rejects.toThrow(/unable to verify/i);
  });

  it("succeeds with one", async () => {
    const res = await fetch(`https://localhost:${port}/`, { tls: { ca: caPem } });
    expect(res.status).toBe(200);
  });

  it("accepts several joined by newlines, which is how getCaBundle stores them", async () => {
    const bundle = [caPem2, caPem].join("\n");
    const res = await fetch(`https://localhost:${port}/`, { tls: { ca: bundle } });
    expect(res.status).toBe(200);
  });

  it("works when the matching authority is not the first in the bundle", async () => {
    // Order is by name in the database, so the one that matters can be anywhere.
    const bundle = [caPem2, caPem2, caPem].join("\n");
    const res = await fetch(`https://localhost:${port}/`, { tls: { ca: bundle } });
    expect(res.status).toBe(200);
  });

  it("still fails when only an unrelated authority is supplied", async () => {
    // Proof the previous tests pass because of the certificate, not because
    // supplying anything at all disables the check.
    await expect(
      fetch(`https://localhost:${port}/`, { tls: { ca: caPem2 } }),
    ).rejects.toThrow(/unable to verify/i);
  });
});

describe("the assumption the whole design rests on", () => {
  it("adds to the system authorities rather than replacing them", async () => {

    let res;
    try {
      res = await fetch("https://api.github.com/", {
        tls: { ca: caPem },
        headers: { "User-Agent": "chops-test" },
      });
    } catch (err) {
      // No network is not a failure of the thing being tested, but a TLS error is
      if (/unable to verify|certificate|self.signed/i.test(err.message)) throw err;
      console.warn("  skipped: no network");
      return;
    }
    // Any response at all means the handshake succeeded. GitHub answers 200 or 403 depending on rate limits, and either proves the point.
    expect(res.status).toBeGreaterThan(0);
  });
});

describe("reading the certificate a server presents", () => {
  it("exposes the issuer, which is how the usage list matches", () => {
    // controllers/trustedCa.js compares this against the stored subjects to say
    // which clusters depend on which authority.
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        { host: "localhost", port, ca: [caPem], servername: "localhost" },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          try {
            expect(cert.subject.CN).toBe("localhost");
            expect(cert.issuer.CN).toBe("Test Internal CA");
            resolve();
          } catch (e) { reject(e); }
        },
      ).on("error", reject);
    });
  });

  it("reports whether the supplied authorities validated it", () => {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        { host: "localhost", port, ca: [caPem], servername: "localhost" },
        () => {
          const authorized = socket.authorized;
          socket.end();
          try { expect(authorized).toBe(true); resolve(); } catch (e) { reject(e); }
        },
      ).on("error", reject);
    });
  });
});
