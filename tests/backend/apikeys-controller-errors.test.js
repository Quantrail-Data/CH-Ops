// Controller error responses must not depend on service implementation details.
import { describe, expect, it, mock } from 'bun:test';

const getAllApiKeys = mock();
const getApiKeysWithValues = mock();
const getActiveApiKey = mock();
const getApiKeyById = mock();

mock.module('../../src/backend/services/apiKeys.js', () => ({
  getAllApiKeys,
  getApiKeysWithValues,
  getActiveApiKey,
  getApiKeyById,
  createApiKey: mock(),
  updateApiKey: mock(),
  deleteApiKey: mock(),
  setActiveApiKey: mock(),
}));
mock.module('../../src/backend/db/index.js', () => ({ db: {} }));
mock.module('../../src/backend/db/schema.js', () => ({ apiKeys: {} }));
mock.module('../../src/backend/services/crypto.js', () => ({ decrypt: (value) => value }));
mock.module('../..//src/backend/servicesAI/AIService.js', () => ({ default: class {} }));

const {
  getAPIKeys,
  getAPIKeyById,
  getActiveAPIKey,
  getAPIKeysWithValues,
} = await import('../../src/backend/controllers/apikeys.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('API key controller service errors', () => {
  it('turns listing service failures into 500 responses', () => {
    getAllApiKeys.mockImplementation(() => { throw new Error('database unavailable'); });
    const res = response();

    getAPIKeys({}, res);

    expect(res).toMatchObject({ statusCode: 500, body: { error: 'database unavailable' } });
  });

  it('turns API key lookup service failures into 500 responses', async () => {
    getApiKeyById.mockImplementation(() => { throw new Error('read failed'); });
    const res = response();

    await getAPIKeyById({ params: { id: '1' } }, res);

    expect(res).toMatchObject({ statusCode: 500, body: { error: 'read failed' } });
  });

  it('turns active-key and reveal-list service failures into 500 responses', () => {
    getActiveApiKey.mockImplementation(() => { throw new Error('active read failed'); });
    let res = response();
    getActiveAPIKey({}, res);
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'active read failed' } });

    getApiKeysWithValues.mockImplementation(() => { throw new Error('values read failed'); });
    res = response();
    getAPIKeysWithValues({}, res);
    expect(res).toMatchObject({ statusCode: 500, body: { error: 'values read failed' } });
  });
});
