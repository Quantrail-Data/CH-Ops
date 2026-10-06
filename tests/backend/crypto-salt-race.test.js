import { describe, expect, it, mock } from 'bun:test';

const salt = Buffer.alloc(32, 7);
const mkdirSync = mock();
const readFileSync = mock()
  .mockImplementationOnce(() => { const error = new Error('missing'); error.code = 'ENOENT'; throw error; })
  .mockImplementation(() => salt);
const writeFileSync = mock(() => {
  const error = new Error('already created by another process');
  error.code = 'EEXIST';
  throw error;
});

// Exercise the race-safe branch without creating files in the working tree.
mock.module('fs', () => {
  const api = { mkdirSync, readFileSync, writeFileSync };
  return { ...api, default: api };
});

const { decrypt, initCrypto } = await import('../../src/backend/services/crypto.js');

describe('credential crypto salt initialization', () => {
  it('re-reads the salt when another process creates it first', () => {
    initCrypto('a-session-secret-that-is-longer-than-thirty-two-characters');

    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { flag: 'wx' });
    expect(readFileSync).toHaveBeenCalledTimes(2);
  });

  it('leaves a tampered legacy ciphertext untouched rather than throwing', () => {
    const invalidLegacyCiphertext = `${'00'.repeat(16)}:${'00'.repeat(16)}:${'ff'.repeat(16)}`;

    expect(decrypt(invalidLegacyCiphertext)).toBe(invalidLegacyCiphertext);
  });
});
