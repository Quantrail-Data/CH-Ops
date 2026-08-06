// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// localVectorStoreService.test.js - unit tests for LocalVectorStore
import { describe, it, expect, afterEach } from "bun:test";
import { randomUUID } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import LocalVectorStore from "../../src/backend/servicesAI/LocalVectorStoreService.js?real";
import { VECTOR_DIMENSION } from "../../src/backend/servicesAI/constants.js";

const createdIds = [];

function newDatabaseId() {
  const id = `test-vec-${randomUUID()}`;
  createdIds.push(id);
  return id;
}

function unitVector(at) {
  const v = new Array(VECTOR_DIMENSION).fill(0);
  v[at] = 1;
  return v;
}

afterEach(async () => {
  while (createdIds.length) {
    const id = createdIds.pop();
    await new LocalVectorStore(id).deleteDatabaseFile();
  }
});

describe("LocalVectorStore constructor", () => {
  it("throws without a databaseId", () => {
    expect(() => new LocalVectorStore()).toThrow(/requires a databaseId/);
  });
});

describe("LocalVectorStore.initialize / save / load", () => {
  it("creates an empty store file when none exists", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    const ok = await store.initialize();
    expect(ok).toBe(true);
    expect(await store.getVectors()).toEqual([]);
  });

  it("round-trips vectors saved by one instance through a fresh instance", async () => {
    const id = newDatabaseId();
    const writer = new LocalVectorStore(id);
    await writer.initialize();
    await writer.upsert([
      { id: "p1", vector: unitVector(0), payload: { table_name: "orders" } },
    ]);

    const reader = new LocalVectorStore(id);
    await reader.initialize();
    const vectors = await reader.getVectors();

    expect(vectors).toHaveLength(1);
    expect(vectors[0].id).toBe("p1");
    expect(vectors[0].vector).toEqual(unitVector(0));
    expect(vectors[0].payload.table_name).toBe("orders");
  });

  it("throws on a malformed store file (vectors not an array)", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await mkdir(store.storagePath, { recursive: true });
    await writeFile(store.filePath, JSON.stringify({ version: 1 }), "utf-8");
    await expect(store.load()).rejects.toThrow(/vectors' array missing/);
  });

  it("warns but does not throw on a dimension mismatch", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await mkdir(store.storagePath, { recursive: true });
    await writeFile(
      store.filePath,
      JSON.stringify({
        version: 1,
        dimension: 3,
        vectors: [{ id: "p1", vector: [1, 2, 3] }],
      }),
      "utf-8",
    );

    await expect(store.load()).resolves.toBeUndefined();
    expect(await store.getVectors()).toHaveLength(1);
  });
});

describe("LocalVectorStore.upsert", () => {
  it("rejects a point without an id", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await expect(
      store.upsert([{ vector: unitVector(0) }]),
    ).rejects.toThrow(/non-empty 'id'/);
  });

  it("rejects a vector with the wrong dimension", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await expect(
      store.upsert([{ id: "p1", vector: [1, 2, 3] }]),
    ).rejects.toThrow(/must have \d+ dimensions/);
  });

  it("inserts new points and updates existing ones in place, preserving created_at", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([{ id: "p1", vector: unitVector(0) }]);
    const firstCreatedAt = (await store.getPoint("p1")).payload.created_at;
    await store.upsert([
      { id: "p1", vector: unitVector(1) },
      { id: "p2", vector: unitVector(2) },
    ]);
    const vectors = await store.getVectors();
    expect(vectors).toHaveLength(2);
    const p1 = await store.getPoint("p1");
    expect(p1.vector).toEqual(unitVector(1));
    expect(p1.payload.created_at).toBe(firstCreatedAt);
  });

  it("returns { upserted: 0 } for an empty points array without writing", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    const result = await store.upsert([]);
    expect(result).toEqual({ upserted: 0 });
  });
});

describe("LocalVectorStore.search", () => {
  it("ranks results by cosine/dot-product similarity, highest first", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([
      { id: "low", vector: unitVector(1) },
      { id: "high", vector: unitVector(0) },
    ]);

    const results = await store.search(unitVector(0), 10);
    expect(results.map((r) => r.id)).toEqual(["high", "low"]);
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBe(0);
  });

  it("respects the limit", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([
      { id: "a", vector: unitVector(0) },
      { id: "b", vector: unitVector(1) },
      { id: "c", vector: unitVector(2) },
    ]);

    const results = await store.search(unitVector(0), 2);
    expect(results).toHaveLength(2);
  });

  it("rejects a non-array or empty query vector", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await expect(store.search(null)).rejects.toThrow(/non-empty array/);
    await expect(store.search([])).rejects.toThrow(/non-empty array/);
  });

  it("rejects a query vector with the wrong dimension", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await expect(store.search([1, 2, 3])).rejects.toThrow(/expected/);
  });
});

describe("LocalVectorStore.searchAcrossDatabases", () => {
  it("aggregates, sorts, and limits results across multiple stores", async () => {
    const idA = newDatabaseId();
    const idB = newDatabaseId();
    const storeA = new LocalVectorStore(idA);
    await storeA.initialize();
    await storeA.upsert([{ id: "a-mid", vector: unitVector(1) }]);
    const storeB = new LocalVectorStore(idB);
    await storeB.initialize();
    await storeB.upsert([{ id: "b-best", vector: unitVector(0) }]);
    const results = await LocalVectorStore.searchAcrossDatabases(
      unitVector(0),
      [idA, idB],
      10,
    );
    expect(results[0].id).toBe("b-best");
    expect(results.map((r) => r.id)).toContain("a-mid");
  });

  it("expands an empty databaseIds array to every known store", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([{ id: "only", vector: unitVector(0) }]);
    const results = await LocalVectorStore.searchAcrossDatabases(
      unitVector(0),
      [],
      10,
    );
    expect(results.some((r) => r.id === "only")).toBe(true);
  });

  it('expands ["ALL"] to every known store the same way', async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([{ id: "only2", vector: unitVector(0) }]);
    const results = await LocalVectorStore.searchAcrossDatabases(
      unitVector(0),
      ["ALL"],
      10,
    );
    expect(results.some((r) => r.id === "only2")).toBe(true);
  });

  it("rejects a query vector with the wrong dimension", async () => {
    await expect(
      LocalVectorStore.searchAcrossDatabases([1, 2, 3], [], 10),
    ).rejects.toThrow(/must have \d+ dimensions/);
  });
});

describe("LocalVectorStore.listDatabaseIds", () => {
  it("includes created stores and excludes .tmp files", async () => {
    const id = newDatabaseId();
    await new LocalVectorStore(id).initialize();
    const ids = await LocalVectorStore.listDatabaseIds();
    expect(ids).toContain(id);
    expect(ids.every((i) => !i.endsWith(".tmp"))).toBe(true);
  });
});

describe("LocalVectorStore.clearStore", () => {
  it("empties the vectors and respects the save flag", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([{ id: "p1", vector: unitVector(0) }]);
    await store.clearStore({ save: false });
    expect(await store.getVectors()).toEqual([]);
    const reloaded = new LocalVectorStore(id);
    await reloaded.load();
    expect(await reloaded.getVectors()).toHaveLength(1);
  });
});

describe("LocalVectorStore.deleteDatabaseFile", () => {
  it("reports deleted: true when the file existed", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    const result = await store.deleteDatabaseFile();
    expect(result).toEqual({ deleted: true });
  });

  it("reports deleted: false when there was nothing to delete", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    const result = await store.deleteDatabaseFile();
    expect(result).toEqual({ deleted: false });
  });
});

describe("LocalVectorStore metrics", () => {
  it("reports a non-zero disk size after saving", async () => {
    const id = newDatabaseId();
    const store = new LocalVectorStore(id);
    await store.initialize();
    await store.upsert([{ id: "p1", vector: unitVector(0) }]);
    expect(store.getMetrics().diskSizeBytes).toBeGreaterThan(0);
  });
});
