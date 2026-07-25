//import { describe, it, expect, beforeEach, mock } from "bun:test";
import {describe,it,expect,beforeEach,afterEach,mock,} from "bun:test";
import {GoogleGenAI} from "@google/genai";
import {Mistral} from "@mistralai/mistralai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import AIServices from "../../../src/backend/servicesAI/AIService.js";
const mockGenerateContent = mock();
const mockResponsesCreate = mock();
const mockMistralComplete = mock();
const mockClaudeCreate = mock();
const mockCreate = mock();
const decrypt = mock(() => "decrypted-api-key");

let originalError;
mock.module("@google/genai", () => ({
  GoogleGenAI: mock(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
}));

mock.module("@mistralai/mistralai", () => ({
    Mistral: mock(() => ({
        chat: {
            complete: mockMistralComplete,
        },
    })),
}));

mock.module("@anthropic-ai/sdk", () => ({
    default: mock(() => ({
        messages: {
            create: mockClaudeCreate,
        },
    })),
}))

mock.module("openai", () => ({
    default: mock(() => ({
        responses: {
            create: mockResponsesCreate,
        },
        chat: {
            completions: {
                create: mockCreate,
            },
        },
    })),
}));

mock.module("../../../src/backend/services/crypto.js", () => ({ decrypt }));

describe("AIServices", () => {
  beforeEach(() => {
   mockGenerateContent.mockReset();
    mockCreate.mockReset();
    mockResponsesCreate.mockReset();
    mockMistralComplete.mockReset();
    mockClaudeCreate.mockReset();
    decrypt.mockClear();
    originalError = console.error;
    console.error=mock();
    //decrypt.mockReset();
    //decrypt.mockReturnValue("decrypted-api-key");
  });
  afterEach(() => {
  console.error = originalError;
});

  describe("Constructor", () => {
    it("throws when provider missing", () => {
      expect(() => {
        new AIServices(null, "gemini-3.5-flash", "apikey");
      }).toThrow("Provider is missing");
    });

    it("throws when model missing", () => {
      expect(() => {
        new AIServices("GEMINI", null, "apikey");
      }).toThrow("Model name is missing");
    });

    it("throws when api key missing", () => {
      expect(() => {
        new AIServices("GEMINI", "gemini-3.5-flash", null);
      }).toThrow("API key is missing");
    });

    it("initializes Gemini", () => {
      const service = new AIServices(
        "GEMINI",
        "gemini-3.5-flash",
        "encrypted-key",
      );
      expect(decrypt).toHaveBeenCalledWith("encrypted-key");
      expect(service.provider).toBe("GEMINI");
      expect(service.modelName).toBe("gemini-3.5-flash");
    });
  });

  describe("OpenAI constructor", () => {
    it("initializes OpenAI client", () => {
      const service = new AIServices("OPEN AI", "gpt-4o-mini", "encrypted-key");
      expect(decrypt).toHaveBeenCalledWith("encrypted-key");
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: "decrypted-api-key",
      });

      expect(service.client).toBeDefined();
      expect(service.provider).toBe("OPEN AI");
      expect(service.modelName).toBe("gpt-4o-mini");
    });
  });

  describe("Mistral constructor", () => {
    it("initializes Mistral", () => {
      const service = new AIServices(
        "MISTRAL",
        "mistral-medium-3-5",
        "encrypted-key",
      );
      expect(Mistral).toHaveBeenCalledWith({ apiKey: "decrypted-api-key" });
      expect(service.provider).toBe("MISTRAL");
      expect(service.modelName).toBe("mistral-medium-3-5");
    });
  });

  describe("Claude constructor", () => {
    it("initializes Claude", () => {
      const service = new AIServices(
        "CLAUDE",
        "claude-haiku-4-5",
        "encrypted-key",
      );

      expect(Anthropic).toHaveBeenCalledWith({ apiKey: "decrypted-api-key" });
      expect(service.provider).toBe("CLAUDE");
      expect(service.modelName).toBe("claude-haiku-4-5");
    });
  });

  describe("ask()", () => {
    it("returns Gemini response", async () => {
      const service = new AIServices("GEMINI", "gemini-1.5-pro", "apikey");
      mockGenerateContent.mockResolvedValue({
        text: "Hello from Gemini",
      });
      const result = await service.ask("Hello");
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: "gemini-1.5-pro",
        contents: "Hello",
      });
      expect(result).toBe("Hello from Gemini");
    });

    it("throws rate limit error", async () => {
      const service = new AIServices("GEMINI", "gemini-1.5-pro", "apikey");
      mockGenerateContent.mockRejectedValue({
        status: 429,
        message: "Resource exhausted",
      });

      await expect(service.ask("Hello")).rejects.toEqual({
        statusCode: 504,
        errorCode: "AI_PROVIDER_RATE_LIMIT_EXCEEDED",
        message: "AI provider rate limit exceeded. Please try again later.",
      });
    });

    it(" should throw authentication error", async () => {
      const service = new AIServices("GEMINI", "gemini-1.5-pro", "apikey");
      mockGenerateContent.mockRejectedValue({
        status: 401,
        message: "Request had invalid authentication credentials.",
      });

      await expect(service.ask("Hello")).rejects.toEqual({
        statusCode: 403,
        errorCode: "AI_AUTHENTICATION_FAILED",
        message:
          "AI service authentication failed. Please verify the provider configuration.",
      });
    });

    it("should throw unavailable error", async () => {
      const service = new AIServices("GEMINI", "gemini-1.5-pro", "apikey");
      mockGenerateContent.mockRejectedValue({
        status: 503,
        message: "currently experiencing high demand",
      });

      await expect(service.ask("Hello")).rejects.toEqual({
        statusCode: 503,
        errorCode: "AI_SERVICE_UNAVAILABLE",
        message:
          "AI service is temporarily unavailable. Please try again later.",
      });
    });

    it("throws generic error", async () => {
      const service = new AIServices("GEMINI", "gemini-1.5-pro", "apikey");
      mockGenerateContent.mockRejectedValue(
        new Error("An internal server error occurred."),
      );
      await expect(service.ask("Hello")).rejects.toMatchObject({
        statusCode: 500,
        message: "An internal server error occurred.",
      });
    });
  });
});
