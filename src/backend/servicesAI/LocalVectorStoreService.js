// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Dhivyadharshini, Ravivarman)
// // LocalVectorStore provides persistent local storage, indexing, and cosine similarity search for embedding vectors grouped by database.

import { join, parse } from "path";

import {
  readFile,
  writeFile,
  mkdir,
  rename,
  readdir,
  unlink,
  access,
  stat,
} from "fs/promises";

import { VECTOR_DIMENSION, VECTOR_STORE_FOLDER, MODEL_NAME } from "./constants";

class LocalVectorStore {
  constructor(databaseId) {
    if (!databaseId) {
      throw new Error("LocalVectorStore requires a databaseId");
    }

    this.databaseId = databaseId;
    this.storagePath = join(process.cwd(), VECTOR_STORE_FOLDER);
    this.fileName = `${databaseId}.json`;
    this.filePath = join(this.storagePath, this.fileName);
    this.tempFilePath = join(this.storagePath, `${this.fileName}.tmp`);

    this.store = {
      version: 1,
      model: MODEL_NAME,
      dimension: VECTOR_DIMENSION,
      normalized: true,
      database_id: databaseId,
      vectors: [],
    };

    this.pointIndex = new Map();

    this.metrics = {
      loadTimeMs: 0,
      saveTimeMs: 0,
      searchLatencyMs: 0,
      vectorCount: 0,
      diskSizeBytes: 0,
      memoryUsageBytes: 0,
    };
  }

  static async listDatabaseIds() {
    const storagePath = join(process.cwd(), VECTOR_STORE_FOLDER);

    try {
      await access(storagePath);
    } catch {
      return [];
    }

    const files = await readdir(storagePath);

    return files
      .filter((f) => f.endsWith(".json") && !f.endsWith(".json.tmp"))
      .map((f) => parse(f).name);
  }

  async initialize() {
    try {
      try {
        await access(this.storagePath);
      } catch {
        await mkdir(this.storagePath, { recursive: true });
      }
      try {
        await access(this.filePath);
        await this.load();
      } catch {
        await this.save();
        console.log(this.metrics);
      }
      return true;
    } catch (error) {
      console.error("Vector store initialization failed:", error.message);
      return false;
    }
  }

  buildIndexes() {
    this.pointIndex.clear();
    this.store.vectors.forEach((point, idx) => {
      if (!point) return;
      this.pointIndex.set(point.id, idx);
    });
  }

  // Static multi-database cosine similarity search
  static async searchAcrossDatabases(
    queryVector,
    databaseIds = [],
    limit = 10,
  ) {
    if (
      !Array.isArray(queryVector) ||
      queryVector.length !== VECTOR_DIMENSION
    ) {
      throw new Error(`Query vector must have ${VECTOR_DIMENSION} dimensions`);
    }

    const availableDbs = await LocalVectorStore.listDatabaseIds();

    // If empty or containing "ALL", query all available vector stores
    const targetDbs =
      databaseIds.length === 0 || databaseIds.includes("ALL")
        ? availableDbs
        : databaseIds.filter((dbId) => availableDbs.includes(dbId));

    let allScoredResults = [];

    for (const dbId of targetDbs) {
      const store = new LocalVectorStore(dbId);
      await store.initialize();

      const results = await store.search(queryVector, limit);
      allScoredResults.push(...results);
    }

    // Sort combined results by highest cosine similarity score
    allScoredResults.sort((a, b) => b.score - a.score);
    return allScoredResults.slice(0, limit);
  }

  async save() {
    const start = performance.now();
    try {
      const payload = JSON.stringify(this.store, null, 2);
      await writeFile(this.tempFilePath, payload, "utf-8");
      await rename(this.tempFilePath, this.filePath);
      await this.updateDiskSizeMetric();
    } catch (error) {
      console.error("Failed to save vector store:", error.message);
      throw error;
    } finally {
      this.metrics.saveTimeMs = performance.now() - start;
    }
  }

  async load() {
    const start = performance.now();

    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.vectors)
      ) {
        throw new Error("Invalid vector store file: 'vectors' array missing");
      }

      if (parsed.dimension && parsed.dimension !== VECTOR_DIMENSION) {
        console.warn(
          ` Vector store dimension mismatch: file has ${parsed.dimension}, expected ${VECTOR_DIMENSION}.  +
            Existing vectors were likely produced by a different model.`,
        );
      }

      for (const point of parsed.vectors) {
        if (!point?.id || !Array.isArray(point.vector)) {
          throw new Error(
            `Malformed point in store: ${JSON.stringify(point).slice(0, 120)}`,
          );
        }
      }
      this.store = {
        version: parsed.version ?? 1,
        model: parsed.model ?? MODEL_NAME,
        dimension: parsed.dimension ?? VECTOR_DIMENSION,
        normalized: parsed.normalized ?? true,
        database_id: parsed.database_id ?? this.databaseId,
        vectors: parsed.vectors,
      };
      this.metrics.vectorCount = this.store.vectors.length;

      this.buildIndexes();

      await this.updateDiskSizeMetric();
      this.updateMemoryMetric();
    } catch (error) {
      console.error("Failed to load vector store:", error.message);
      throw error;
    } finally {
      this.metrics.loadTimeMs = performance.now() - start;
    }
  }

  async clearStore(options = { save: true }) {
    this.store.vectors = [];
    this.pointIndex.clear();
    this.metrics.vectorCount = 0;
    this.updateMemoryMetric();
    if (options.save) {
      await this.save();
    }
  }

  async upsert(points, options = { save: true }) {
    if (!Array.isArray(points) || points.length === 0) {
      return { upserted: 0 };
    }

    const nowIso = new Date().toISOString();

    for (const point of points) {
      if (!point?.id) {
        throw new Error("Each point requires a non-empty 'id'");
      }
      if (
        !Array.isArray(point.vector) ||
        point.vector.length !== VECTOR_DIMENSION
      ) {
        throw new Error(
          ` Point ${point.id}: vector must have ${VECTOR_DIMENSION} dimensions, got ${point.vector?.length}`,
        );
      }

      const existingIdx = this.pointIndex.get(point.id);
      const record = {
        id: point.id,
        vector: point.vector,
        payload: {
          ...(point.payload ?? {}),
          created_at:
            point.payload?.created_at ??
            (existingIdx !== undefined
              ? this.store.vectors[existingIdx]?.payload?.created_at
              : nowIso) ??
            nowIso,
          updated_at: nowIso,
        },
      };

      if (existingIdx !== undefined) {
        // Update existing record
        this.store.vectors[existingIdx] = record;
        this.pointIndex.set(record.id, existingIdx);
      } else {
        // Insert new record
        const newIndex = this.store.vectors.length;
        this.store.vectors.push(record);
        this.pointIndex.set(record.id, newIndex);
      }
    }
    this.metrics.vectorCount = this.store.vectors.length;
    this.updateMemoryMetric();

    if (options.save) {
      await this.save();
    }

    return { upserted: points.length };
  }

  async search(queryVector, limit = 10) {
    const start = performance.now();
    try {
      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        throw new Error("Query vector must be a non-empty array");
      }

      if (queryVector.length !== VECTOR_DIMENSION) {
        throw new Error(
          `  Query vector has ${queryVector.length} dimensions, expected ${VECTOR_DIMENSION}`,
        );
      }

      const scored = [];

      for (const point of this.store.vectors) {
        if (!point) continue;

        const vec = point.vector;
        let dot = 0;
        for (let j = 0; j < VECTOR_DIMENSION; j++) {
          dot += vec[j] * queryVector[j];
        }

        scored.push({
          id: point.id,
          score: dot,
          database_id: this.databaseId,
          payload: point.payload,
        });
      }

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit);
    } finally {
      this.metrics.searchLatencyMs = performance.now() - start;
      this.updateMemoryMetric();
    }
  }

  async getVectors() {
    return this.store.vectors;
  }

  async getPoint(id) {
    const idx = this.pointIndex.get(id);
    return idx !== undefined ? this.store.vectors[idx] : null;
  }

  async deleteDatabaseFile() {
    let deleted = false;

    try {
      await access(this.filePath);
      await unlink(this.filePath);
      deleted = true;
    } catch {
      deleted = false;
    }

    this.store.vectors = [];
    this.pointIndex.clear();

    this.metrics.vectorCount = 0;
    this.metrics.diskSizeBytes = 0;
    this.updateMemoryMetric();

    return { deleted };
  }
  async updateDiskSizeMetric() {
    try {
      const fileInfo = await stat(this.filePath);

      this.metrics.diskSizeBytes = fileInfo.size;
    } catch {
      this.metrics.diskSizeBytes = 0;
    }
  }

  updateMemoryMetric() {
    const memory = process.memoryUsage();

    this.metrics.memoryUsageBytes = memory.heapUsed;
  }

  getMetrics() {
    return {
      ...this.metrics,
    };
  }
}

export default LocalVectorStore;
