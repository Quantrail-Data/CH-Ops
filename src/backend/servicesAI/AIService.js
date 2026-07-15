// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Manages AI provider integrations and prompt execution
const { GoogleGenAI } = require("@google/genai");
const { decrypt } = require("../services/crypto");
const OpenAI = require("openai");
const {Mistral} = require("@mistralai/mistralai");
const Anthropic = require("@anthropic-ai/sdk");

class AIServices {
  constructor(provider, modelName, APIkey) {
    if (!provider) {
      throw new Error("Provider is missing");
    }

    if (!modelName) {
      throw new Error("Model name is missing");
    }

    if (!APIkey) {
      throw new Error("API key is missing");
    }

    this.provider = provider.toUpperCase();
    this.modelName = modelName;
    this.apiKey = decrypt(APIkey);
    this.client = null;

    switch (this.provider) {
      case "GEMINI":
        this.client = new GoogleGenAI({
          apiKey: this.apiKey,
        });
        break;

      case "MISTRAL":
        this.client = new Mistral({
          apiKey: this.apiKey,
        });
        break;

      case "CLAUDE":
        this.client = new Anthropic({
          apiKey: this.apiKey,
        });
        break;

      case "OPEN AI":
        this.client = new OpenAI({
          apiKey: this.apiKey,
        });
        break;

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  async ask(prompt) {
    try {
      switch (this.provider) {
        case "GEMINI": {
          const response = await this.client.models.generateContent({
            model: this.modelName,
            contents: prompt,
          });
          return response.text;
        }

        case "MISTRAL": {
          const response = await this.client.chat.complete({
            model: this.modelName,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          });

          return response.choices?.[0]?.message?.content ?? "";
        }
        case "CLAUDE": {
          const response = await this.client.messages.create({
            model: this.modelName,
            max_tokens: 8048,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          });
          return response.content?.[0]?.text ?? "";
        }

        case "OPEN AI": {
          const response = await this.client.responses.create({
            model: this.modelName,
            input: prompt,
          });
          console.log("OpenAI Response:", JSON.stringify(response, null, 2));
          return response.output_text ?? "";
        }
      }
    } catch (error) {
      const status = error?.status || error?.statusCode || error?.code;
      const message = error?.message || "";

      // Rate Limit
      if (
        status === 429 ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("resource exhausted")
      ) {
        throw {
          statusCode: 504,
          errorCode: "AI_PROVIDER_RATE_LIMIT_EXCEEDED",
          message: "AI provider rate limit exceeded. Please try again later.",
        };
      }

      // Authentication
      if (
        status === 401 ||
        status === 403 ||
        message.toLowerCase().includes("authentication") ||
        message.toLowerCase().includes("invalid api key") ||
        message.toLowerCase().includes("invalid authentication")
      ) {
        throw {
          statusCode: 403,
          errorCode: "AI_AUTHENTICATION_FAILED",
          message:
            "AI service authentication failed. Please verify the provider configuration.",
        };
      }

      // Service unavailable
      if (
        status === 503 ||
        message.toLowerCase().includes("high demand") ||
        message.toLowerCase().includes("service unavailable")
      ) {
        throw {
          statusCode: 503,
          errorCode: "AI_SERVICE_UNAVAILABLE",
          message:
            "AI service is temporarily unavailable. Please try again later.",
        };
      }

      console.error(`${this.provider} API Error:`, {
        status,
        message,
        stack: error?.stack,
      });

      const err = new Error("An internal server error occurred.");
      err.statusCode = 500;
      throw err;
    }
  }
}

module.exports = AIServices;