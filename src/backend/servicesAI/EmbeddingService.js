// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Converts text into vector embeddings for semantic search.

const { pipeline } = require("@xenova/transformers");

class EmbeddingService {
  constructor() {
    this.model = "Xenova/all-MiniLM-L6-v2";
    this.extractor = null;
  }

  async loadModel() {
    if (!this.extractor) {
      console.log("Loading embedding model...");
      this.extractor = await pipeline("feature-extraction", this.model);
      console.log("Model loaded successfully.");
      console.log("Before loading model:");
      console.log(process.memoryUsage());

      this.extractor = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      );

      console.log("After loading model:");
      console.log(process.memoryUsage());
    }
  }

  async embed(text) {
    try {
      await this.loadModel();
      console.log("Embedding request:", text);
      const output = await this.extractor(text, {
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

module.exports = EmbeddingService;