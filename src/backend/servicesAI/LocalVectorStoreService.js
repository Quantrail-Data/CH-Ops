// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Dhivyadharshini, Ravivarman)

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "fs";
import { join, parse } from "path";

import {
  VECTOR_DIMENSION,
  VECTOR_STORE_FOLDER,
  VECTOR_STORE_FILE,
  MODEL_NAME,
} from "./constants";
import { version } from "os";
import { point } from "drizzle-orm/pg-core";

class LocalVectorStore {
  constructor() {
    this.storagePath = join(process.cwd(), VECTOR_STORE_FOLDER);
    this.filePath = join(this.storagePath, VECTOR_STORE_FILE);
    this.tempFilePath = join(this.storagePath, `${VECTOR_STORE_FILE}.tmp`);
    console.log(process.cwd());
    console.log(this.storagePath);

    this.store = {
      version: 1,
      model: MODEL_NAME,
      dimension: VECTOR_DIMENSION,
      normalized: true,
      vectors: [],
    };

    this.pointIndex = new Map();

    this.databaseIndex = new Map();
  }

  async initialize() {
    try {
      console.log("storagePath:", this.storagePath);
      console.log("filePath:", this.filePath);
      if (!existsSync(this.storagePath)) {
        mkdirSync(this.storagePath, { recursive: true });
      }
      if (!existsSync(this.filePath)) {
        await this.save();
      } else {
        await this.load();
      }
      this.buildIndexes();
      return true;
    } catch (error) {
      console.error("Vector store Initializatio failed:", error);
      return false;
    }
  }

  buildIndexes() {
    this.pointIndex.clear();
    this.databaseIndex.clear();

    this.store.vectors.forEach((point, idx) => {
      if (!point) return;
      this.pointIndex.set(point.id, idx);

      const dbId = point.payload?.database_id;
      if (dbId === undefined || dbId === null) return;

      if (!this.databaseIndex.has(dbId)) {
        this.databaseIndex.set(dbId, []);
      }
      this.databaseIndex.get(dbId).push(idx);
    });
  }

  async save() {
    try {
      const payload = JSON.stringify(this.store, null, 2);
      writeFileSync(this.tempFilePath, payload, "utf-8");
      renameSync(this.tempFilePath, this.filePath);
    } catch (error) {
      console.error("Failed to save vector store:", error);
      throw error;
    }
  }

  async load() {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
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
          `Vector store dimension mismatch: file has ${parsed.dimension}, expected ${VECTOR_DIMENSION}. ` +
            `Existing vectors were likely produced by a different model.`,
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
        vectors: parsed.vectors,
      };
      this.buildIndexes();
    } catch (error) {
      console.error("Failed to load vector store:", error);
      throw error;
    }
  }

  async upsert(points) {
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
          `Point ${point.id}: vector must have ${VECTOR_DIMENSION} dimensions, got ${point.vector?.length}`,
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
        this.store.vectors[existingIdx] = record;
      } else {
        this.store.vectors.push(record);
      }
    }

    this.buildIndexes();
    await this.save();

    return { upserted: points.length };
  }

  async search(databaseId, queryVector, limit = 10) {
    if (!Array.isArray(queryVector)) {
      throw new Error("Query vector must be a valid array");
    }

    const candidateIdxs = this.databaseIndex.get(databaseId) ?? [];
    if (candidateIdxs.length === 0) return [];

    const scored = [];
    // Math defense: compute matching dimensions safely up to array boundaries
    const targetLen = Math.min(VECTOR_DIMENSION, queryVector.length);

    for (const idx of candidateIdxs) {
      const point = this.store.vectors[idx];
      if (!point) continue;

      const vec = point.vector;
      let dot = 0;
      for (let j = 0; j < targetLen; j++) {
        dot += vec[j] * queryVector[j];
      }

      scored.push({ id: point.id, score: dot, payload: point.payload });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async deleteDatabaseVectors(databaseId) {
    const before = this.store.vectors.length;
    this.store.vectors = this.store.vectors.filter(
      (point) => point?.payload?.database_id !== databaseId,
    );
    const removed = before - this.store.vectors.length;

    this.buildIndexes();

    if (removed > 0) {
      await this.save();
    }

    return { removed };
  }

  async getDatabaseVectors(databaseId) {
    const idxs = this.databaseIndex.get(databaseId) ?? [];
    return idxs.map((idx) => this.store.vectors[idx]).filter(Boolean);
  }

  async isexists(databaseId) {
    const idxs = this.databaseIndex.get(databaseId);
    return Boolean(idxs && idxs.length > 0);
  }
}

export default LocalVectorStore;
