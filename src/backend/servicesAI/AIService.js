// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Manages AI provider integrations and prompt execution
import { GoogleGenAI } from "@google/genai";
import { decrypt } from "../services/crypto";
import OpenAI from "openai";
import { Mistral } from "@mistralai/mistralai";
import Anthropic from "@anthropic-ai/sdk";

// Plain loop instead of a regex like /\/+$/ - CodeQL flags trailing-quantifier
// regexes run against user-controlled input (here, the Ollama base URL) as a
// potential ReDoS vector. A loop is O(n) with no backtracking ambiguity.
function stripTrailingSlashes(str) {
  let end = str.length;
  while (end > 0 && str[end - 1] === "/") end--;
  return str.slice(0, end);
}

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

      case "OLLAMA":
        // this.apiKey holds the decrypted Ollama base URL (e.g.
        // http://localhost:11434) - Ollama has no real API key, but the SDK
        // requires a truthy string, and Ollama ignores whatever is sent.
        this.client = new OpenAI({
          apiKey: "ollama",
          baseURL: `${stripTrailingSlashes(this.apiKey)}/v1`,
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
          return response.output_text ?? "";
        }

        case "OLLAMA": {
          // Ollama's OpenAI-compatible layer only implements the Chat
          // Completions API, not the newer Responses API used above.
          // temperature: 0 - this call is used for intent classification and
          // strict schema-bound SQL generation, not open-ended chat; local
          // models left at Ollama's default (~0.8) sampling produce different
          // classifications/SQL for the same input from one call to the next.
          const response = await this.client.chat.completions.create({
            model: this.modelName,
            temperature: 0,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          });
          return response.choices?.[0]?.message?.content ?? "";
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

      // Anything not matched above (bad model name, malformed request, etc.)
      // still carries a specific, provider-reported reason - surface it
      // instead of a generic message, so API key validation in the UI can
      // tell the user what's actually wrong instead of just "failed".
      const err = new Error(message || "An internal server error occurred.");
      err.statusCode = Number.isInteger(status) ? status : 500;
      throw err;
    }
  }
}

export default AIServices;
