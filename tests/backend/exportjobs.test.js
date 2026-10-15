
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "bun:test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

process.env.EXPORT_DIR ||= path.join(
  os.tmpdir(),
  "chops-export-jobs-test",
);


const startExportStream = vi.fn();
const writeExportFile = vi.fn();
const killExportQuery = vi.fn();

vi.mock("../../src/backend/services/exportStream.js", () => ({
  startExportStream,
  killExportQuery,
}));

vi.mock("../../src/backend/services/exportCompress.js", () => ({
  writeExportFile,
}));


const {
  runJob,
  initExportStorage,
  safeFileName,
  createJob,
  getJob,
  describeJob,
  cancelJob,
  cancelJobsForUser,
  issueTicket,
  redeemTicket,
  startExportSweeper,
  touchJob,
  exportConfig,
} = await import("../../src/backend/services/exportJobs.js");

const cfg = exportConfig();

const NODE = {
  host: "10.0.0.1",
  port: 8123,
  secure: false,
};

const realFetch = global.fetch;
const created = [];

// -----------------------------------------------------------------------------
// Existing helper for createJob() tests
// NOTE: createJob() automatically starts runJob().
// -----------------------------------------------------------------------------

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
    creds: {
      user: "chops",
      password: "pw",
    },
    ...overrides,
  });

  created.push(job);
  return job;
}


function makeRunJob() {
  const id = crypto.randomUUID();

  return {
    id,
    userId: "kathir",
    state: "running",

    createdAt: Date.now(),
    lastActivityAt: Date.now(),

    sql: "SELECT 1",

    format: "CSVWithNames",
    compression: "zip",
    settings: {},

    bom: true,

    node: NODE,

    creds: {
      user: "chops",
      password: "pw",
    },

    dir: path.join(cfg.dir, id),

    fileName: "report.csv.zip",
    filePath: path.join(cfg.dir, id, "report.csv.zip"),
    innerName: "report.csv",

    queryId: crypto.randomUUID(),

    bytesRead: 0,
    bytesWritten: 0,
    estimatedBytes: 10,

    error: null,

    abort: new AbortController(),
  };
}


beforeEach(() => {
  global.fetch = () => new Promise(() => { });

  startExportStream.mockReset();
  writeExportFile.mockReset();
  killExportQuery.mockReset();

  initExportStorage();
});

afterEach(() => {
  for (const job of created.splice(0)) {
    try {
      cancelJob(job.id, job.userId);
    } catch {
      // Already removed.
    }
  }
});

afterAll(() => {
  global.fetch = realFetch;
  fs.rmSync(cfg.dir, {
    recursive: true,
    force: true,
  });
});


describe("safeFileName", () => {
  test("keeps an ordinary name", () => {
    expect(
      safeFileName("sales-report_2026"),
    ).toBe("sales-report_2026");
  });

  test("cannot escape its folder", () => {
    expect(
      safeFileName("../../etc/passwd"),
    ).not.toContain("..");

    expect(
      safeFileName("../../etc/passwd"),
    ).not.toContain("/");

    expect(
      safeFileName("a/b\\c"),
    ).not.toMatch(/[\\/]/);
  });

  test("strips control characters and exotic symbols", () => {
    expect(
      safeFileName("re\u0000port\u001f!*?"),
    ).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test("turns an email-style username into something usable", () => {
    expect(
      safeFileName("kathir@corp.com"),
    ).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test("falls back when nothing usable is left", () => {
    expect(
      safeFileName("", "export"),
    ).toBe("export");

    expect(
      safeFileName("///", "export"),
    ).toBe("export");

    expect(
      safeFileName(null, "export"),
    ).toBe("export");
  });

  test("caps the length", () => {
    expect(
      safeFileName("a".repeat(500)).length,
    ).toBeLessThanOrEqual(100);
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
    const a = makeJob({
      username: "one",
    });

    const b = makeJob({
      username: "two",
    });

    expect(a.dir).not.toBe(b.dir);
    expect(a.fileName).toBe(b.fileName);
  });

  test("rejects an unknown format or compression", () => {
    expect(() =>
      makeJob({
        format: "NotAFormat",
      }),
    ).toThrow(/format/i);

    expect(() =>
      makeJob({
        compression: "rar",
      }),
    ).toThrow(/compression/i);
  });

  test("holds the caller to their own concurrent limit", () => {
    for (let i = 0; i < cfg.maxPerUser; i++) {
      makeJob({
        username: "amy",
      });
    }

    expect(() =>
      makeJob({
        username: "amy",
      }),
    ).toThrow(/exports running/i);

    expect(() =>
      makeJob({
        username: "ben",
      }),
    ).not.toThrow();
  });

  test('holds all users to the server-wide concurrent export limit', () => {
    startExportStream.mockImplementation(() => new Promise(() => {}));
    for (let i = 0; i < cfg.maxConcurrent; i++) {
      makeJob({ username: `user-${i}` });
    }

    expect(() => makeJob({ username: 'another-user' })).toThrow(/server is busy/i);
  });

  test("refuses a job that would not fit in the remaining space", () => {
    expect(() =>
      makeJob({
        estimatedBytes: cfg.maxTotalBytes + 1,
      }),
    ).toThrow(/space/i);
  });
});

describe("reading a job", () => {
  test("the owner can read it", () => {
    const job = makeJob({
      username: "kathir",
    });

    expect(
      getJob(job.id, "kathir"),
    ).toBeTruthy();
  });

  test("nobody else can, even with the right id", () => {
    const job = makeJob({
      username: "kathir",
    });

    expect(
      getJob(job.id, "someone-else"),
    ).toBeNull();

    expect(
      getJob(job.id, undefined),
    ).toBeNull();
  });

  test("an unknown id returns nothing", () => {
    expect(
      getJob("no-such-job", "kathir"),
    ).toBeNull();
  });

  test("progress is a percentage of the estimate, held below complete", () => {
    const job = makeJob({
      estimatedBytes: 1000,
    });

    job.bytesRead = 500;

    expect(
      describeJob(job).percent,
    ).toBe(50);

    job.bytesRead = 5000;

    expect(
      describeJob(job).percent,
    ).toBe(99);
  });

  test("a ready job reports complete", () => {
    const job = makeJob();

    job.state = "ready";

    expect(
      describeJob(job).percent,
    ).toBe(100);
  });

  test("no percentage is invented when there was no estimate", () => {
    const job = makeJob({
      estimatedBytes: 0,
    });

    expect(
      describeJob(job).percent,
    ).toBeNull();
  });

  test('touching a job records fresh activity', () => {
    const job = makeJob();
    const originalNow = Date.now;
    Date.now = () => 123456;
    try {
      touchJob(job);
    } finally {
      Date.now = originalNow;
    }
    expect(job.lastActivityAt).toBe(123456);
  });
});

describe("cancelling", () => {
  test("removes the job and its files, and drops the credentials", () => {
    const job = makeJob();

    expect(job.creds).toBeTruthy();

    expect(
      cancelJob(job.id, "kathir"),
    ).toBe(true);

    expect(job.creds).toBeNull();
    expect(fs.existsSync(job.dir)).toBe(false);

    expect(
      getJob(job.id, "kathir"),
    ).toBeNull();
  });

  test("someone else cannot cancel it", () => {
    const job = makeJob({
      username: "kathir",
    });

    expect(
      cancelJob(job.id, "someone-else"),
    ).toBe(false);

    expect(
      getJob(job.id, "kathir"),
    ).toBeTruthy();
  });

  test("logging out cancels that person's jobs and nobody else's", () => {
    const mine = makeJob({
      username: "kathir",
    });

    const theirs = makeJob({
      username: "other",
    });

    cancelJobsForUser("kathir");

    expect(
      getJob(mine.id, "kathir"),
    ).toBeNull();

    expect(
      getJob(theirs.id, "other"),
    ).toBeTruthy();
  });
});

describe("download tickets", () => {
  test("a ticket redeems once the file is ready", () => {
    const job = makeJob();

    job.state = "ready";

    expect(
      redeemTicket(issueTicket(job)).id,
    ).toBe(job.id);
  });

  test("a ticket is useless while the job is still running", () => {
    const job = makeJob();

    job.state = "running";

    expect(
      redeemTicket(issueTicket(job)),
    ).toBeNull();
  });

  test("an unknown ticket is refused", () => {
    expect(
      redeemTicket("made-up"),
    ).toBeNull();
  });

  test("tickets are unguessable and unique", () => {
    const job = makeJob();

    job.state = "ready";

    const a = issueTicket(job);
    const b = issueTicket(job);

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  test('an expired ticket is deleted and cannot be redeemed', () => {
    const job = makeJob();
    job.state = 'ready';
    const ticket = issueTicket(job);
    const originalNow = Date.now;
    Date.now = () => originalNow() + 60 * 1000 + 1;
    try {
      expect(redeemTicket(ticket)).toBeNull();
      expect(redeemTicket(ticket)).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });
});

describe('export sweeper', () => {
  test('removes idle completed jobs and expired tickets without retaining the timer', () => {
    const job = makeJob();
    job.state = 'ready';
    job.lastActivityAt = 1;
    const ticket = issueTicket(job);
    let sweep;
    let unrefCalled = false;
    const originalInterval = globalThis.setInterval;
    const originalNow = Date.now;
    globalThis.setInterval = (callback) => {
      sweep = callback;
      return { unref() { unrefCalled = true; } };
    };
    Date.now = () => cfg.idleTtlMs + 2;
    try {
      startExportSweeper();
      sweep();
    } finally {
      globalThis.setInterval = originalInterval;
      Date.now = originalNow;
    }

    expect(unrefCalled).toBe(true);
    expect(getJob(job.id, job.userId)).toBeNull();
    expect(redeemTicket(ticket)).toBeNull();
  });
});

describe("storage", () => {
  test("startup clears anything left by a previous run", () => {
    const orphan = path.join(
      cfg.dir,
      "left-behind",
    );

    fs.mkdirSync(orphan, {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(orphan, "old.csv"),
      "x",
    );

    initExportStorage();

    expect(
      fs.existsSync(orphan),
    ).toBe(false);
  });

  test("the configured limits are sane", () => {
    expect(
      cfg.maxPerUser,
    ).toBeGreaterThan(0);

    expect(
      cfg.maxConcurrent,
    ).toBeGreaterThanOrEqual(
      cfg.maxPerUser,
    );

    expect(
      cfg.maxJobBytes,
    ).toBeLessThanOrEqual(
      cfg.maxTotalBytes,
    );

    expect(
      typeof cfg.dir,
    ).toBe("string");
  });
});


describe("Runs export job", () => {
  test("exports job successfully", async () => {
    startExportStream.mockResolvedValueOnce({
      body: "stream",
    });

    writeExportFile.mockResolvedValueOnce(150);

    const job = makeRunJob();

    const expectedCredentials = {
      user: job.creds.user,
      password: job.creds.password,
    };

    await runJob(job);

    expect(startExportStream).toHaveBeenCalledWith({
      host: job.node.host,
      port: job.node.port,
      secure: job.node.secure,
      user: expectedCredentials.user,
      password: expectedCredentials.password,
      sql: job.sql,
      format: job.format,
      settings: job.settings,
      queryId: job.queryId,
      signal: job.abort.signal,
    });

    expect(writeExportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        webStream: "stream",
        destPath: job.filePath,
        compression: job.compression,
        innerName: job.innerName,
        bom: job.bom,
        limitBytes: cfg.maxJobBytes,
        onBytes: expect.any(Function),
      }),
    );

    expect(job.readyAt).toBeDefined();
    expect(job.state).toBe("ready");
    expect(job.bytesWritten).toBe(150);
    expect(job.error).toBeNull();
    expect(job.creds).toBeNull();
  });

  test("updates bytesRead when the writer reports progress", async () => {
    startExportStream.mockResolvedValueOnce({
      body: "stream",
    });

    writeExportFile.mockImplementationOnce(
      async ({ onBytes }) => {
        onBytes(250);
        return 150;
      },
    );

    const job = makeRunJob();

    await runJob(job);

    expect(job.bytesRead).toBe(250);
    expect(job.bytesWritten).toBe(150);
    expect(job.state).toBe("ready");
  });

  test("aborts the job when total export storage is exceeded", async () => {
    startExportStream.mockResolvedValueOnce({
      body: "stream",
    });

    writeExportFile.mockImplementationOnce(
      async ({ onBytes }) => {
        onBytes(cfg.maxTotalBytes + 1);
        return 150;
      },
    );

    const job = makeRunJob();

    const abortSpy = vi.spyOn(
      job.abort,
      "abort",
    );

    await runJob(job);

    expect(job.bytesRead).toBe(
      cfg.maxTotalBytes + 1,
    );

    expect(
      abortSpy,
    ).toHaveBeenCalled();
  });

  test("marks the job as failed when export throws", async () => {
    startExportStream.mockRejectedValueOnce(
      new Error("Failed."),
    );

    const job = makeRunJob();

    await runJob(job);

    expect(job.state).toBe("failed");
    expect(job.error).toBe("Failed.");
    expect(job.creds).toBeNull();

    expect(killExportQuery).toHaveBeenCalledWith({
      host: job.node.host,
      port: job.node.port,
      secure: job.node.secure,
      user: "chops",
      password: "pw",
      queryId: job.queryId,
    });
  });

  test("uses the export-too-large error message", async () => {
    const error = new Error("Too large");
    error.code = "EXPORT_TOO_LARGE";

    startExportStream.mockRejectedValueOnce(
      error,
    );

    const job = makeRunJob();

    await runJob(job);

    expect(job.state).toBe("failed");

    expect(job.error).toBe(
      "The export grew past the size limit and was stopped.",
    );
  });

  test("uses the AbortError message when the export is aborted", async () => {
    const error = new Error("Aborted");
    error.name = "AbortError";

    startExportStream.mockRejectedValueOnce(
      error,
    );

    const job = makeRunJob();

    await runJob(job);

    expect(job.state).toBe("failed");
    expect(job.error).toBe(
      "The export was stopped.",
    );
  });

  test("uses a fallback message when the error has no message", async () => {
    startExportStream.mockRejectedValueOnce({});

    const job = makeRunJob();

    await runJob(job);

    expect(job.state).toBe("failed");
    expect(job.error).toBe("Export failed.");
  });

  test("does not mark a cancelled job as failed", async () => {
    const job = makeRunJob();

    startExportStream.mockImplementationOnce(
      async () => {
        job.state = "cancelled";
        throw new Error("Export stopped");
      },
    );

    await runJob(job);

    expect(job.state).toBe("cancelled");
    expect(job.error).toBeNull();
    expect(
      fs.existsSync(job.dir),
    ).toBe(false);
  });
});
