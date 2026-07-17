// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Converts text into vector embeddings for semantic search.

<<<<<<< HEAD
import { pipeline } from "@xenova/transformers";
import { MODEL_NAME } from "./constants";

class EmbeddingService {
  static extractor = null;

  async loadModel() {
    EmbeddingService.extractor = await pipeline(
      "feature-extraction",
      MODEL_NAME,
    );
=======
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
>>>>>>> bde0a9f83079795ff5851336aedf252ce31ac9ef
  }

  async embed(text) {
    try {
      await this.loadModel();
<<<<<<< HEAD

      console.log("Embedding request:", text);

      const output = await EmbeddingService.extractor(text, {
        pooling: "mean",
        normalize: true,
      });

      const embedding = Array.from(output.data);

=======
      console.log("Embedding request:", text);
      const output = await this.extractor(text, {
        pooling: "mean",
        normalize: true,
      });
      const embedding = Array.from(output.data);
>>>>>>> bde0a9f83079795ff5851336aedf252ce31ac9ef
      console.log("Embedding length:", embedding.length);

      return embedding;
    } catch (error) {
      console.error("Embedding Error:", error);
      throw new Error("Failed to generate embedding");
    }
  }
}

<<<<<<< HEAD
export default EmbeddingService;
=======
module.exports = EmbeddingService;
>>>>>>> bde0a9f83079795ff5851336aedf252ce31ac9ef
