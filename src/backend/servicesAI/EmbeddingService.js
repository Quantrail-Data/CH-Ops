// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Converts text into vector embeddings for semantic search.

import { pipeline } from "@xenova/transformers";
import { MODEL_NAME } from "./constants";

class EmbeddingService {
  static extractor = null;

  async loadModel() {
    EmbeddingService.extractor = await pipeline(
      "feature-extraction",
      MODEL_NAME,
    );
  }

  async embed(text) {
    try {
      await this.loadModel();

      console.log("Embedding request:", text);

      const output = await EmbeddingService.extractor(text, {
        pooling: "mean",
        normalize: true,
      });

      const embedding = Array.from(output.data);

      console.log("Embedding length:", embedding.length);

      return embedding;
    } catch (error) {
      console.error("Embedding Error:", error);
      throw new Error("Failed to generate embedding");
    }
  }
}

export default EmbeddingService;
