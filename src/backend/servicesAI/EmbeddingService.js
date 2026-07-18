// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Converts text into vector embeddings for semantic search.

import fs from "fs";
import path from "path";
import { MODEL_NAME } from "./constants";

// Static imports (with the `file` type attribute) so `bun build --compile`
// embeds these two .wasm binaries into the compiled executable itself -
// onnxruntime-web loads its wasm asset via a path it computes dynamically at
// runtime, which bun's bundler can't see, so the file never gets embedded
// unless something imports it directly like this. Resolves to a real
// node_modules path in dev and to a `/$bunfs/...` path once compiled; either
// way the resulting string is a real, readable filesystem path.
import wasmSimdPath from "onnxruntime-web/dist/ort-wasm-simd.wasm" with { type: "file" };
import wasmPath from "onnxruntime-web/dist/ort-wasm.wasm" with { type: "file" };

class EmbeddingService {
  static extractor = null;

  async loadModel() {
    // Memoized: every embed() call used to re-run pipeline() unconditionally,
    // which builds a brand new ONNX session (reloading the ~22MB of weights
    // into onnxruntime-web's WASM linear memory) per call. onnxruntime-web's
    // WASM module is a process-wide singleton that's only initialized once
    // (see its wasm-factory.js), so old sessions' memory was never reclaimed -
    // across a schema sync with many tables, the WASM heap grew until a
    // pointer exceeded the 32-bit signed range, surfacing deep inside
    // onnxruntime's session run as "RangeError: Offset should not be
    // negative". Reusing a single loaded extractor avoids the leak entirely.
    if (EmbeddingService.extractor) {
      return;
    }

    // Deferred until actually needed: @xenova/transformers loads a native
    // onnxruntime binding as a side effect of import, which a compiled
    // (`bun build --compile`) binary can't resolve (its sibling .dylib/.so
    // isn't embedded alongside the .node file). A static top-level import
    // here would drag that in at server startup - through SQLGenerationService
    // and sqlAIChat.js - and crash the whole process on every boot, not just
    // this feature. Keeping it dynamic means only an actual embed() call can
    // fail, and it fails as a normal catchable error instead of a boot crash.
    const { pipeline, env } = await import("@xenova/transformers");

    // Single-threaded WASM: onnxruntime-web's default multi-threaded mode
    // spawns workers via blob: URLs for their bootstrap script, which Bun's
    // Worker implementation can't load, throwing uncaught exceptions after
    // inference already completed. Forcing one thread avoids the worker pool
    // entirely - inference still runs, just without that parallelism.
    env.backends.onnx.wasm.numThreads = 1;

    // @xenova/transformers derives its cache dir from this module's own
    // location (import.meta.url), which resolves to a real path under
    // node_modules normally, but to a virtual, read-only bunfs path once
    // compiled (`bun build --compile`) - so writing the model cache fails
    // there. Point it at the app's own writable data dir instead.
    env.cacheDir = path.join(process.cwd(), "data", "ai-model-cache") + "/";

    // Point onnxruntime-web straight at the wasm files embedded above,
    // instead of letting it derive a path from its own module location
    // (which is the bunfs path that isn't backed by a real embedded asset,
    // hence ENOENT once compiled).
    env.backends.onnx.wasm.wasmPaths = {
      "ort-wasm-simd.wasm": wasmSimdPath,
      "ort-wasm.wasm": wasmPath,
    };

    try {
      EmbeddingService.extractor = await pipeline(
        "feature-extraction",
        MODEL_NAME,
      );
    } catch (error) {
      // A model cache left behind by an interrupted/truncated download (killed
      // process, dropped connection, disk full mid-write) parses as a session
      // creation failure - not a missing-file one - since @xenova/transformers
      // never checks downloaded bytes against Content-Length before caching.
      // One clean redownload attempt recovers automatically instead of the
      // service staying permanently broken until someone manually clears the
      // cache dir.
      console.error(
        "Model load failed, clearing cache and retrying once:",
        error.stack || error.message,
      );
      fs.rmSync(path.join(env.cacheDir, MODEL_NAME), {
        recursive: true,
        force: true,
      });
      EmbeddingService.extractor = await pipeline(
        "feature-extraction",
        MODEL_NAME,
      );
    }
  }

  async embed(text) {
    try {
      await this.loadModel();

      const output = await EmbeddingService.extractor(text, {
        pooling: "mean",
        normalize: true,
      });

      return Array.from(output.data);
    } catch (error) {
      console.error("Embedding error:", error.stack || error.message);
      throw new Error("Failed to generate embedding");
    }
  }
}

export default EmbeddingService;
