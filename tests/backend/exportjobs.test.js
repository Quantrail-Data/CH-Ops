// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";


process.env.EXPORT_DIR ||= path.join(os.tmpdir(), "chops-export-jobs-test");

const {
  initExportStorage, safeFileName, createJob, getJob, describeJob,
  cancelJob, cancelJobsForUser, issueTicket, redeemTicket, exportConfig,
} = await import("../../src/backend/services/exportJobs.js");

const cfg = exportConfig();
const NODE = { host: "10.0.0.1", port: 8123, secure: false };

const realFetch = global.fetch;
const created = [];

function makeJob(overrides = {}) {
  const job = createJob({
    username: "kathir",
    sql: "SELECT 1",
    format: "CSVWithNames",
    compression: "zip",
    settings: {},
    filename: "report",
    bom: true,
    node: NODE,
    estimatedBytes: 10,
    creds: { user: "chops", password: "pw" },
    ...overrides,
  });
  created.push(job);
  return job;
}

beforeEach(() => {
  
  global.fetch = () => new Promise(() => {});
  initExportStorage();
});

afterEach(() => {
  for (const job of created.splice(0)) {
    try { cancelJob(job.id, job.userId); } catch { /* already gone */ }
  }
});

afterAll(() => {
  global.fetch = realFetch;
  fs.rmSync(cfg.dir, { recursive: true, force: true });
});

describe("safeFileName", () => {
  test("keeps an ordinary name", () => {
    expect(safeFileName("sales-report_2026")).toBe("sales-report_2026");
  });

  // The name becomes a path on the server, so it must never point anywhere else.
  test("cannot escape its folder", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("..");
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("a/b\\c")).not.toMatch(/[\\/]/);
  });

  test("strips control characters and exotic symbols", () => {
    expect(safeFileName("re\u0000port\u001f!*?")).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test("turns an email-style username into something usable", () => {
    expect(safeFileName("kathir@corp.com")).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test("falls back when nothing usable is left", () => {
    expect(safeFileName("", "export")).toBe("export");
    expect(safeFileName("///", "export")).toBe("export");
    expect(safeFileName(null, "export")).toBe("export");
  });

  test("caps the length", () => {
    expect(safeFileName("a".repeat(500)).length).toBeLessThanOrEqual(100);
  });
});

describe("creating a job", () => {
  test("gives the job its own folder and builds the full filename", () => {
    const job = makeJob();
    expect(job.fileName).toBe("report.csv.zip");
    expect(fs.existsSync(job.dir)).toBe(true);
    expect(job.filePath.startsWith(cfg.dir)).toBe(true);
  });

  test("two users exporting the same name do not collide", () => {
    const a = makeJob({ username: "one" });
    const b = makeJob({ username: "two" });
    expect(a.dir).not.toBe(b.dir);
    expect(a.fileName).toBe(b.fileName);
  });

  test("rejects an unknown format or compression", () => {
    expect(() => makeJob({ format: "NotAFormat" })).toThrow(/format/i);
    expect(() => makeJob({ compression: "rar" })).toThrow(/compression/i);
  });

  test("holds the caller to their own concurrent limit", () => {
    for (let i = 0; i < cfg.maxPerUser; i++) makeJob({ username: "amy" });
    expect(() => makeJob({ username: "amy" })).toThrow(/exports running/i);
    // Someone else is unaffected by that person's limit.
    expect(() => makeJob({ username: "ben" })).not.toThrow();
  });

  test("refuses a job that would not fit in the remaining space", () => {
    expect(() => makeJob({ estimatedBytes: cfg.maxTotalBytes + 1 })).toThrow(/space/i);
  });
});

describe("reading a job", () => {
  test("the owner can read it", () => {
    const job = makeJob({ username: "kathir" });
    expect(getJob(job.id, "kathir")).toBeTruthy();
  });

  // Without this, anyone holding a job id could download somebody else's query results.
  test("nobody else can, even with the right id", () => {
    const job = makeJob({ username: "kathir" });
    expect(getJob(job.id, "someone-else")).toBeNull();
    expect(getJob(job.id, undefined)).toBeNull();
  });

  test("an unknown id returns nothing", () => {
    expect(getJob("no-such-job", "kathir")).toBeNull();
  });

  test("progress is a percentage of the estimate, held below complete", () => {
    const job = makeJob({ estimatedBytes: 1000 });
    job.bytesRead = 500;
    expect(describeJob(job).percent).toBe(50);
    job.bytesRead = 5000;
    expect(describeJob(job).percent).toBe(99);
  });

  test("a ready job reports complete", () => {
    const job = makeJob();
    job.state = "ready";
    expect(describeJob(job).percent).toBe(100);
  });

  test("no percentage is invented when there was no estimate", () => {
    const job = makeJob({ estimatedBytes: 0 });
    expect(describeJob(job).percent).toBeNull();
  });
});

describe("cancelling", () => {
  test("removes the job and its files, and drops the credentials", () => {
    const job = makeJob();
    expect(job.creds).toBeTruthy();
    expect(cancelJob(job.id, "kathir")).toBe(true);
    expect(job.creds).toBeNull();
    expect(fs.existsSync(job.dir)).toBe(false);
    expect(getJob(job.id, "kathir")).toBeNull();
  });

  test("someone else cannot cancel it", () => {
    const job = makeJob({ username: "kathir" });
    expect(cancelJob(job.id, "someone-else")).toBe(false);
    expect(getJob(job.id, "kathir")).toBeTruthy();
  });

  test("logging out cancels that person's jobs and nobody else's", () => {
    const mine = makeJob({ username: "kathir" });
    const theirs = makeJob({ username: "other" });
    cancelJobsForUser("kathir");
    expect(getJob(mine.id, "kathir")).toBeNull();
    expect(getJob(theirs.id, "other")).toBeTruthy();
  });
});

describe("download tickets", () => {
  // A browser download is a plain navigation and cannot carry the login header, so a
  // short-lived ticket stands in for it.
  test("a ticket redeems once the file is ready", () => {
    const job = makeJob();
    job.state = "ready";
    expect(redeemTicket(issueTicket(job)).id).toBe(job.id);
  });

  test("a ticket is useless while the job is still running", () => {
    const job = makeJob();
    job.state = "running";
    expect(redeemTicket(issueTicket(job))).toBeNull();
  });

  test("an unknown ticket is refused", () => {
    expect(redeemTicket("made-up")).toBeNull();
  });

  test("tickets are unguessable and unique", () => {
    const job = makeJob();
    job.state = "ready";
    const a = issueTicket(job), b = issueTicket(job);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("storage", () => {
  test("startup clears anything left by a previous run", () => {
    const orphan = path.join(cfg.dir, "left-behind");
    fs.mkdirSync(orphan, { recursive: true });
    fs.writeFileSync(path.join(orphan, "old.csv"), "x");
    initExportStorage();
    expect(fs.existsSync(orphan)).toBe(false);
  });

  test("the configured limits are sane", () => {
    expect(cfg.maxPerUser).toBeGreaterThan(0);
    expect(cfg.maxConcurrent).toBeGreaterThanOrEqual(cfg.maxPerUser);
    expect(cfg.maxJobBytes).toBeLessThanOrEqual(cfg.maxTotalBytes);
    expect(typeof cfg.dir).toBe("string");
  });
});