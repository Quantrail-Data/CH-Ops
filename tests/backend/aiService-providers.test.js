import { beforeEach, describe, expect, it, mock } from 'bun:test';

const generateContent = mock();
const mistralComplete = mock();
const anthropicCreate = mock();
let googleOptions;
let mistralOptions;
let anthropicOptions;

mock.module('../..//src/backend/services/crypto.js', () => ({ decrypt: (value) => `plain:${value}` }));
mock.module('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(options) { googleOptions = options; this.models = { generateContent }; }
  },
}));
mock.module('@mistralai/mistralai', () => ({
  Mistral: class {
    constructor(options) { mistralOptions = options; this.chat = { complete: mistralComplete }; }
  },
}));
mock.module('@anthropic-ai/sdk', () => ({
  default: class {
    constructor(options) { anthropicOptions = options; this.messages = { create: anthropicCreate }; }
  },
}));
mock.module('openai', () => ({ default: class {} }));

const AIServices = (await import('../../src/backend/servicesAI/AIService.js')).default;

beforeEach(() => {
  generateContent.mockReset();
  mistralComplete.mockReset();
  anthropicCreate.mockReset();
  googleOptions = null;
  mistralOptions = null;
  anthropicOptions = null;
});

describe('AIServices provider SDK adapters', () => {
  it('constructs Gemini, Mistral, and Claude clients with the decrypted API key', () => {
    new AIServices('GEMINI', 'gemini-2.5', 'encrypted');
    expect(googleOptions).toEqual({ apiKey: 'plain:encrypted' });
    new AIServices('MISTRAL', 'mistral-small', 'encrypted');
    expect(mistralOptions).toEqual({ apiKey: 'plain:encrypted' });
    new AIServices('CLAUDE', 'claude-sonnet', 'encrypted');
    expect(anthropicOptions).toEqual({ apiKey: 'plain:encrypted' });
  });

  it('dispatches prompts to Gemini and returns its text result', async () => {
    generateContent.mockResolvedValue({ text: 'gemini answer' });
    const ai = new AIServices('GEMINI', 'gemini-2.5', 'key');
    expect(await ai.ask('hello')).toBe('gemini answer');
    expect(generateContent).toHaveBeenCalledWith({ model: 'gemini-2.5', contents: 'hello' });
  });

  it('dispatches prompts to Mistral and Claude and tolerates empty content', async () => {
    mistralComplete.mockResolvedValue({ choices: [{ message: { content: 'mistral answer' } }] });
    let ai = new AIServices('MISTRAL', 'mistral-small', 'key');
    expect(await ai.ask('hello')).toBe('mistral answer');
    expect(mistralComplete).toHaveBeenCalledWith({
      model: 'mistral-small', messages: [{ role: 'user', content: 'hello' }],
    });

    anthropicCreate.mockResolvedValue({});
    ai = new AIServices('CLAUDE', 'claude-sonnet', 'key');
    expect(await ai.ask('hello')).toBe('');
    expect(anthropicCreate).toHaveBeenCalledWith({
      model: 'claude-sonnet', max_tokens: 8048, messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('classifies provider unavailability and preserves unknown errors', async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error('service unavailable'), { status: 503 }));
    await expect(new AIServices('GEMINI', 'gemini', 'key').ask('hello')).rejects.toMatchObject({
      statusCode: 503, errorCode: 'AI_SERVICE_UNAVAILABLE',
    });

    mistralComplete.mockRejectedValueOnce({ code: 418, message: 'model is invalid' });
    await expect(new AIServices('MISTRAL', 'bad-model', 'key').ask('hello')).rejects.toMatchObject({
      statusCode: 418, message: 'model is invalid',
    });
  });
});
