// legacySecrets.js - Encrypts the secrets that older versions stored in plain text.
// Copyright (C) 2026 Quantrail Data Private Limited
//
// Older versions stored notification channel secrets and backup profile keys in plain text.
// A new save encrypts them, but a row that nobody saved again is still plain text.
// This code runs at each server start and encrypts those values in place.
// It does not change a value that is already encrypted ("v1:"). Thus it is safe to run it again.

import { eq } from "drizzle-orm";
import { db, alertChannels, appSettings } from "../db/index.js";
import { encrypt, decrypt } from "./crypto.js";
import { log } from "./logger.js";

// The secret field of each channel type. The same list as DecryptValuesChannels in controllers/alerts.js.
const CHANNEL_SECRET_FIELD = {
  email: "smtp_pass",
  slack: "bot_token",
  google_chat: "webhook_url",
  teams: "webhook_url",
  pagerduty: "routing_key",
};

// The backup profile fields that are encrypted. The same rule as saving a profile in controllers/settings.js.
function backupProfileSecretFields(profile) {
  return profile?.type === "s3"
    ? ["endpoint", "accessKeyId", "accessKey"]
    : ["accessKeyId", "accessKey"];
}

// Returns the value encrypted, or null when it is empty or already encrypted.
// decrypt() also reads values stored by the oldest versions without the "v1:" tag.
function encryptedOrNull(value) {
  if (!value || typeof value !== "string" || value.startsWith("v1:")) return null;
  return encrypt(decrypt(value));
}

export function encryptChannelSecrets() {
  let changedCount = 0;
  for (const channel of db.select().from(alertChannels).all()) {
    const secretField = CHANNEL_SECRET_FIELD[channel.type] || "smtp_pass";
    let config;
    try {
      config = JSON.parse(channel.config || "{}");
    } catch {
      log.warn("Channel settings could not be read, so they were not encrypted", {
        channel: channel.name,
      });
      continue;
    }
    const encryptedValue = encryptedOrNull(config[secretField]);
    if (!encryptedValue) continue;
    config[secretField] = encryptedValue;
    db.update(alertChannels)
      .set({ config: JSON.stringify(config) })
      .where(eq(alertChannels.id, channel.id))
      .run();
    changedCount += 1;
  }
  return changedCount;
}

export function encryptBackupProfileSecrets() {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "backup_profiles"))
    .get();
  if (!row?.value) return 0;

  let profiles;
  try {
    profiles = JSON.parse(row.value);
  } catch {
    log.warn("Backup profiles could not be read, so they were not encrypted");
    return 0;
  }
  if (!Array.isArray(profiles)) return 0;

  let changedCount = 0;
  for (const profile of profiles) {
    for (const field of backupProfileSecretFields(profile)) {
      const encryptedValue = encryptedOrNull(profile[field]);
      if (!encryptedValue) continue;
      profile[field] = encryptedValue;
      changedCount += 1;
    }
  }
  if (changedCount > 0) {
    db.update(appSettings)
      .set({ value: JSON.stringify(profiles) })
      .where(eq(appSettings.id, row.id))
      .run();
  }
  return changedCount;
}

// Called at server start, after initCrypto().
export function encryptLegacySecrets() {
  try {
    const channelCount = encryptChannelSecrets();
    const profileFieldCount = encryptBackupProfileSecrets();
    if (channelCount || profileFieldCount) {
      log.info("Encrypted secrets stored in plain text by an older version", {
        channels: channelCount,
        backupProfileFields: profileFieldCount,
      });
    }
  } catch (error) {
    // A failure here must not stop the server. The values stay as they were and still work.
    log.error("Encrypting old secrets failed", { error: error.message });
  }
}
