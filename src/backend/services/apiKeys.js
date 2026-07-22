// apiKeys.js - API key management for AI and external integrations
//
// CRUD operations for API keys used by Qurioz AI and other integrations.
// Keys are encrypted at rest using AES-256-GCM. Maximum 3 keys allowed.
// Only one key can be active at a time. When a key is deleted, the
// next available key becomes active automatically.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from './crypto.js';

const MAX_API_KEYS = 4;

export function getAllApiKeys() {
  try {
    const keys = db.select().from(apiKeys).all();
    return keys.map(key => ({
      id: key.id,
      name: key.name,
      isActive: !!key.isActive,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      model:key?.model,
    }));
  } catch {
    return [];
  }
}

export function getActiveApiKey() {
  try {
    const active = db.select().from(apiKeys).where(eq(apiKeys.isActive, 1)).get();
    if (!active) return null;
    return {
      id: active.id,
      name: active.name,
      key: decrypt(active.encryptedKey),
      model:active?.model,
      isActive: true,
    };
  } catch {
    return null;
  }
}

export function getApiKeyById(id) {
  try {
    const key = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
    if (!key) return null;
    return {
      id: key.id,
      name: key.name,
      key: decrypt(key.encryptedKey),
      isActive: !!key.isActive,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      model:key?.model,
    };
  } catch {
    return null;
  }
}

export function getApiKeysWithValues() {
  try {
    const keys = db.select().from(apiKeys).all();
    return keys.map(key => ({
      id: key.id,
      name: key.name,
      key: decrypt(key.encryptedKey),
      isActive: !!key.isActive,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      model:key?.model,
    }));
  } catch {
    return [];
  }
}



export function createApiKey(name, apiKeyValue,model,provider) {
  const existing = db.select().from(apiKeys).all();
  if (existing.length >= MAX_API_KEYS) {
    throw new Error(`Maximum ${MAX_API_KEYS} API keys allowed.`);
  }

  const nameExists = existing.some(k => k.name.toLowerCase() === name.trim().toLowerCase());
  if (nameExists) {
    throw new Error('An API key with this name already exists.');
  }

  const encryptedKey = encrypt(apiKeyValue);
  
  const result = db.insert(apiKeys).values({
    name: name.trim(),
    model:model,
    provider:provider.trim(),
    encryptedKey,
    isActive: existing.length === 0 ? 1 : 0,
    // model:active?.model,
  }).run();
  
  const id = result.lastInsertRowid;
  return getApiKeyById(id);
}

export function updateApiKey(id, name, apiKeyValue,model,provider) {
  const existing = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) {
    throw new Error('API key not found.');
  }

  const allKeys = db.select().from(apiKeys).all();
  const nameExists = allKeys.some(k => k.id !== id && k.name.toLowerCase() === name.trim().toLowerCase());
  if (nameExists) {
    throw new Error('An API key with this name already exists.');
  }

  const encryptedKey = encrypt(apiKeyValue);
  
  db.update(apiKeys)
    .set({ name: name.trim(), encryptedKey, provider:provider.trim(), updatedAt: new Date().toISOString(), model:model })
    .where(eq(apiKeys.id, id))
    .run();

  
  
  return getApiKeyById(id);
}

export function deleteApiKey(id) {
  const key = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!key) {
    throw new Error('API key not found.');
  }
  
  const wasActive = key.isActive === 1;
  db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
  
  if (wasActive) {
    const remaining = db.select().from(apiKeys).all();
    if (remaining.length > 0) {
      db.update(apiKeys).set({ isActive: 1 }).where(eq(apiKeys.id, remaining[0].id)).run();
    }
  }
  
  return { deleted: true };
}

export function setActiveApiKey(id) {
  const key = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!key) {
    throw new Error('API key not found.');
  }
  
  db.update(apiKeys).set({ isActive: 0 }).run();
  db.update(apiKeys).set({ isActive: 1 }).where(eq(apiKeys.id, id)).run();
  
  return getApiKeyById(id);
}