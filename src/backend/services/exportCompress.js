// exportCompress.js - Writes the export stream to disk, compressing as it goes.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import fs from "node:fs";
import zlib from "node:zlib";
import { Zip, ZipDeflate } from "fflate";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);


export function zstdAvailable() {
  return typeof zlib.createZstdCompress === "function";
}


function writeAsync(stream, chunk) {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (err) => (err ? reject(err) : undefined));
    if (stream.writableNeedDrain) stream.once("drain", resolve);
    else resolve();
  });
}

function endAsync(stream) {
  return new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });
}

async function* readChunks(webStream, { bom, onBytes, limitBytes }) {
  let total = 0;
  if (bom) {
    total += BOM.length;
    yield BOM;
  }
  for await (const piece of webStream) {
    const chunk = Buffer.from(piece);
    total += chunk.length;
    if (onBytes) onBytes(total);
    if (limitBytes && total > limitBytes) {
      const error = new Error("EXPORT_TOO_LARGE");
      error.code = "EXPORT_TOO_LARGE";
      throw error;
    }
    yield chunk;
  }
}



async function writePlain(source, destPath, transform) {
  const out = fs.createWriteStream(destPath);
  try {
    if (!transform) {
      for await (const chunk of source) await writeAsync(out, chunk);
    } else {
      transform.pipe(out);
      for await (const chunk of source) {
        if (!transform.write(chunk)) {
          await new Promise((r) => transform.once("drain", r));
        }
      }
      await new Promise((resolve, reject) => {
        transform.end();
        out.on("finish", resolve);
        out.on("error", reject);
        transform.on("error", reject);
      });
      return;
    }
    await endAsync(out);
  } finally {
    if (!out.destroyed) out.destroy();
  }
}

async function writeZip(source, destPath, innerName) {
  const out = fs.createWriteStream(destPath);
  const queue = [];
  let failure = null;

  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else queue.push(Buffer.from(chunk));
  });
  const entry = new ZipDeflate(innerName, { level: 6 });
  zip.add(entry);

  const flush = async () => {
    while (queue.length) await writeAsync(out, queue.shift());
    if (failure) throw failure;
  };

  try {
    for await (const chunk of source) {
      entry.push(chunk, false);
      await flush();
    }
    entry.push(new Uint8Array(0), true);
    zip.end();
    await flush();
    await endAsync(out);
  } finally {
    if (!out.destroyed) out.destroy();
  }
}

async function writeTarGz(source, destPath, innerName) {
  const rawPath = `${destPath}.raw`;
  await writePlain(source, rawPath, null);

  const size = fs.statSync(rawPath).size;
  const header = buildTarHeader(innerName, size);

  const gzip = zlib.createGzip();
  const out = fs.createWriteStream(destPath);
  gzip.pipe(out);

  gzip.write(header);
  const input = fs.createReadStream(rawPath);
  for await (const chunk of input) {
    if (!gzip.write(chunk)) await new Promise((r) => gzip.once("drain", r));
  }
  const padding = (512 - (size % 512)) % 512;
  if (padding) gzip.write(Buffer.alloc(padding));
  gzip.write(Buffer.alloc(1024)); 

  await new Promise((resolve, reject) => {
    gzip.end();
    out.on("finish", resolve);
    out.on("error", reject);
  });

  fs.rmSync(rawPath, { force: true });
}

function buildTarHeader(name, size) {
  const head = Buffer.alloc(512);
  const put = (text, offset, length) => head.write(String(text).slice(0, length), offset, length, "utf8");
  const octal = (value, length) => value.toString(8).padStart(length - 1, "0") + "\0";

  put(name, 0, 100);
  put(octal(0o644, 8), 100, 8);   
  put(octal(0, 8), 108, 8);       
  put(octal(0, 8), 116, 8);       
  put(octal(size, 12), 124, 12);  
  put(octal(Math.floor(Date.now() / 1000), 12), 136, 12); 
  head.write("        ", 148, 8, "utf8"); 
  put("0", 156, 1);               
  put("ustar\0", 257, 6);
  put("00", 263, 2);

  let sum = 0;
  for (const byte of head) sum += byte;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return head;
}



export async function writeExportFile({
  webStream, destPath, compression, innerName, bom, onBytes, limitBytes,
}) {
  const source = readChunks(webStream, { bom, onBytes, limitBytes });

  if (compression === "gzip") {
    await writePlain(source, destPath, zlib.createGzip());
  } else if (compression === "zstd") {
    if (!zstdAvailable()) throw new Error("zstd compression is not available on this server.");
    await writePlain(source, destPath, zlib.createZstdCompress());
  } else if (compression === "zip") {
    await writeZip(source, destPath, innerName);
  } else if (compression === "targz") {
    await writeTarGz(source, destPath, innerName);
  } else {
    await writePlain(source, destPath, null);
  }

  return fs.statSync(destPath).size;
}