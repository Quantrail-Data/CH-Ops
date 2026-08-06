// embeddingService.test.js - unit tests for EmbeddingService
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { describe, it, expect, beforeEach, mock } from "bun:test";
import fs from "fs";

// pipelineImpl is swapped per-test to control loadModel()'s behavior
// (success, first-call failure to exercise the retry path, etc).
let pipelineImpl = async () => mock(async () => ({ data: [] }));
const pipelineMock = mock((...args) => pipelineImpl(...args));

mock.module("@xenova/transformers", () => ({
  pipeline: pipelineMock,
  env: {
    cacheDir: "",
    backends: {
      onnx: {
        wasm: {
          numThreads: 0,
          wasmPaths: {},
        },
      },
    },
  },
}));

// `?real`: tests/backend/databaseConnectionSchemaSqlGeneration.test.js mocks
// EmbeddingService.js wholesale for SchemaIngestionService/SQLGenerationService's
// own tests; the query-suffixed specifier is a distinct module cache key
// that resolves to the genuine file regardless of that mock.
const EmbeddingService = (
  await import("../../src/backend/servicesAI/EmbeddingService.js?real")
).default;

beforeEach(() => {
  pipelineMock.mockClear();
  EmbeddingService.extractor = null;
  pipelineImpl = async () => mock(async () => ({ data: [1, 2, 3] }));
});

describe("EmbeddingService.loadModel", () => {
  it("memoizes the extractor across multiple embed() calls", async () => {
    const service = new EmbeddingService();

    await service.embed("first");
    await service.embed("second");

    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  // EmbeddingService always points env.cacheDir at the real
  // data/ai-model-cache dir (it's not injectable), and this machine already
  // has the real model downloaded there. The retry path's real
  // fs.rmSync(cacheDir/MODEL_NAME, { force: true }) call must not delete it.
  // fs.rmSync is monkey-patched directly on the shared "fs" module object
  // (not via mock.module, which is a process-global registry override that
  // broke exportCompress.test.js's own real fs.rmSync cleanup call when
  // tried) and restored in `finally`, so the window of effect is just this
  // one synchronous test body.
  async function withStubbedRmSync(run) {
    const originalRmSync = fs.rmSync;
    const rmSyncMock = mock(() => {});
    fs.rmSync = rmSyncMock;
    try {
      await run(rmSyncMock);
    } finally {
      fs.rmSync = originalRmSync;
    }
  }

  it("retries once after a load failure, clearing the cache dir first", async () => {
    let calls = 0;
    pipelineImpl = async () => {
      calls++;
      if (calls === 1) {
        throw new Error("truncated model download");
      }
      return mock(async () => ({ data: [9] }));
    };

    await withStubbedRmSync(async (rmSyncMock) => {
      const service = new EmbeddingService();
      const result = await service.embed("hello");

      expect(pipelineMock).toHaveBeenCalledTimes(2);
      expect(rmSyncMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual([9]);
    });
  });

  it("propagates a second consecutive failure", async () => {
    pipelineImpl = async () => {
      throw new Error("model host unreachable");
    };

    await withStubbedRmSync(async () => {
      const service = new EmbeddingService();

      await expect(service.embed("hello")).rejects.toThrow(
        "Failed to generate embedding",
      );
      expect(pipelineMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("EmbeddingService.embed", () => {
  it("calls the extractor with mean pooling and normalization", async () => {
    const extractorMock = mock(async () => ({ data: [0.1, 0.2, 0.3] }));
    pipelineImpl = async () => extractorMock;

    const service = new EmbeddingService();
    const result = await service.embed("some schema text");

    expect(extractorMock).toHaveBeenCalledWith("some schema text", {
      pooling: "mean",
      normalize: true,
    });
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it("converts the extractor's typed-array output into a plain array", async () => {
    pipelineImpl = async () =>
      mock(async () => ({ data: new Float32Array([1, 2, 3]) }));

    const service = new EmbeddingService();
    const result = await service.embed("text");

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3]);
  });

  it("wraps an extractor failure in a generic error", async () => {
    pipelineImpl = async () =>
      mock(async () => {
        throw new Error("onnxruntime session run failed");
      });

    const service = new EmbeddingService();

    await expect(service.embed("text")).rejects.toThrow(
      "Failed to generate embedding",
    );
  });
});
