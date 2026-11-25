// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { writeExportFile, zstdAvailable } from "../../src/backend/services/exportCompress.js";

let dir;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "chops-export-test-")); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });


function fakeStream(text, chunkSize = 997) {
  const buf = Buffer.from(text, "utf8");
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < buf.length; i += chunkSize) {
        c.enqueue(new Uint8Array(buf.subarray(i, i + chunkSize)));
      }
      c.close();
    },
  });
}


const DATA = "id,name\n1,Ravi\n2,Ananya\n3,Zoe\u0308\n".repeat(200);
const BYTES = Buffer.byteLength(DATA, "utf8");
const dest = (name) => path.join(dir, name);

describe("no compression", () => {
  test("writes the bytes through unchanged", async () => {
    const p = dest("plain.csv");
    const written = await writeExportFile({
      webStream: fakeStream(DATA), destPath: p, compression: "none", innerName: "plain.csv", bom: false,
    });
    expect(fs.readFileSync(p).toString("utf8")).toBe(DATA);
    expect(written).toBe(BYTES);
  });


  test("puts the byte order mark first when asked", async () => {
    const p = dest("bom.csv");
    await writeExportFile({
      webStream: fakeStream(DATA), destPath: p, compression: "none", innerName: "bom.csv", bom: true,
    });
    const raw = fs.readFileSync(p);
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(raw.subarray(3).toString("utf8")).toBe(DATA);
  });
});

describe("gzip", () => {
  test("round-trips exactly", async () => {
    const p = dest("out.csv.gz");
    await writeExportFile({
      webStream: fakeStream(DATA), destPath: p, compression: "gzip", innerName: "out.csv", bom: false,
    });
    expect(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8")).toBe(DATA);
  });

  test("actually compresses", async () => {
    const p = dest("small.csv.gz");
    const written = await writeExportFile({
      webStream: fakeStream(DATA), destPath: p, compression: "gzip", innerName: "small.csv", bom: false,
    });
    expect(written).toBeLessThan(BYTES);
  });
});

describe("tar.gz", () => {
  test("produces a valid archive with a correct header", async () => {
    const p = dest("out.tar.gz");
    await writeExportFile({
      webStream: fakeStream(DATA), destPath: p, compression: "targz", innerName: "out.csv", bom: false,
    });
    const tar = zlib.gunzipSync(fs.readFileSync(p));

    const name = tar.subarray(0, 100).toString().replace(/\0+$/, "");
    expect(name).toBe("out.csv");

    const size = parseInt(tar.subarray(124, 136).toString().replace(/[\0 ]/g, ""), 8);
    expect(size).toBe(BYTES);

    // The checksum is the sum of every header byte with the checksum field as spaces.
    const header = Buffer.from(tar.subarray(0, 512));
    const stored = parseInt(header.subarray(148, 156).toString().replace(/[\0 ]/g, ""), 8);
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (const b of header) sum += b;
    expect(stored).toBe(sum);

    expect(tar.subarray(512, 512 + BYTES).toString("utf8")).toBe(DATA);
 
    expect(tar.length).toBe(512 + Math.ceil(BYTES / 512) * 512 + 1024);
  });

  test("removes the intermediate file it writes first", async () => {
    const p = dest("clean.tar.gz");
    await writeExportFile({
      webStream: fakeStream(DATA), destPath: p, compression: "targz", innerName: "clean.csv", bom: false,
    });
    expect(fs.existsSync(`${p}.raw`)).toBe(false);
  });
});

describe("zstd", () => {
  test("either works or refuses clearly, never silently", async () => {
    const p = dest("out.csv.zst");
    if (zstdAvailable()) {
      const written = await writeExportFile({
        webStream: fakeStream(DATA), destPath: p, compression: "zstd", innerName: "out.csv", bom: false,
      });
      expect(written).toBeGreaterThan(0);
    } else {
      await expect(writeExportFile({
        webStream: fakeStream(DATA), destPath: p, compression: "zstd", innerName: "out.csv", bom: false,
      })).rejects.toThrow(/not available/i);
    }
  });
});

describe("size limit", () => {
  test("stops once the limit is crossed", async () => {
    const p = dest("toobig.csv");
    let err;
    try {
      await writeExportFile({
        webStream: fakeStream(DATA), destPath: p, compression: "none",
        innerName: "toobig.csv", bom: false, limitBytes: 100,
      });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe("EXPORT_TOO_LARGE");
  });

  test("a file inside the limit is unaffected", async () => {
    const p = dest("fits.csv");
    const written = await writeExportFile({
      webStream: fakeStream("hello"), destPath: p, compression: "none",
      innerName: "fits.csv", bom: false, limitBytes: 1000,
    });
    expect(written).toBe(5);
  });


  test("reports progress in uncompressed bytes", async () => {
    const seen = [];
    await writeExportFile({
      webStream: fakeStream(DATA), destPath: dest("progress.csv.gz"), compression: "gzip",
      innerName: "progress.csv", bom: false, onBytes: (n) => seen.push(n),
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(BYTES);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});
