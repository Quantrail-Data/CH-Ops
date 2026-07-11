// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Manages AI provider integrations and prompt execution
const { GoogleGenAI } = require("@google/genai");
const { decrypt } = require("../services/crypto");

class AIServices {
  constructor(Provider, modelName, APIkey) {
    if (!Provider) {
      throw new Error("Provider is missing");
    }

    if (!modelName) {
      throw new Error("Model name is missing");
    }

    if (!APIkey) {
      throw new Error("API key is missing");
    }

    this.client = null;
    this.provider = Provider;
    this.modelName = modelName;

    switch (Provider) {
      case "GEMINI":
        this.client = this.client = new GoogleGenAI({
          apiKey: decrypt(APIkey),
        });
        break;
      case "OPEN AI":
        this.client = null;
        break;

      default:
        this.client = null;
        break;
    }
  }

  async ask(prompt) {
    if (this.provider === "GEMINI") {
      try {
        const response = await this.client.models.generateContent({
          model: this.modelName,
          contents: prompt,
        });

        return response.text;
      } catch (error) {
        const status = error?.status || error?.code || error?.statusCode;
        const message = error?.message || "";

        // Rate limit
        if (status === 429 || message.includes("Resource exhausted")) {
          // const err = new Error(
          //   "Gemini API rate limit exceeded. Please try again later.",
          // );
          // err.statusCode = 429;
          throw {
            statusCode: 504,
            errorCode: "AI_PROVIDER_RATE_LIMIT_EXCEEDED",
            message: "Gemini API rate limit exceeded. Please try again later.",
          };
        }

        if (
          status === 401 ||
          message.includes("Request had invalid authentication credentials.")
        ) {
          //  const err = new Error(
          //   "Unable to connect to the AI service. The configured API key appears to be invalid. Please update your API key and try again.",
          // );
          // err.statusCode = 401;
          throw {
            statusCode: 403,
            errorCode: "AI_AUTHENTICATION_FAILED",
            message:
              "AI service authentication failed. Please verify the provider configuration.",
          };
        }

        // Service unavailable / overloaded
        if (
          status === 503 ||
          message.includes("currently experiencing high demand")
        ) {
          // const err = new Error(
          //   "Gemini service is temporarily unavailable. Please try again in a few moments.",
          // );
          // err.statusCode = 503;
          throw {
            statusCode: 503,
            errorCode: "AI_SERVICE_UNAVAILABLE",
            message:
              "AI service is temporarily unavailable. Please try again in a few moments.",
          };
        }

        console.error("Gemini API Error:", {
          status,
          message,
          stack: error?.stack,
        });

        const err = new Error("An internal server error occurred.");
        err.statusCode = 500;
        throw err;
      }
    } else if (this.provider === "OPEN AI") {
      console.log("WANT OT UPDATE!");
    }
  }
}

module.exports = AIServices;
