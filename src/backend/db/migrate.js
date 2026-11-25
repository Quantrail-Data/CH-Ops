// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Database migration script that creates schemas, seeds defaults, and runs via 'bun src/backend/db/migrate.js'.
// The schema changes are numbered migrations (db/migrations.js), run safely by
// db/migrationRunner.js: one time each, in a transaction, after a backup.

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import * as schema from "./schema.js";
import { migrateClustersToTables } from "./migrateClusters.js";
import { MIGRATIONS } from "./migrations.js";
import { runMigrations } from "./migrationRunner.js";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "chops.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
// Wait up to 30 s for the write lock of another process (first statement).
sqlite.exec("PRAGMA busy_timeout = 30000");
sqlite.exec("PRAGMA journal_mode = WAL");
sqlite.exec("PRAGMA foreign_keys = ON");

// The numbered schema changes. An error here stops the start (server.js).
runMigrations(sqlite, MIGRATIONS, {
  backupFolder: path.join(path.dirname(DB_PATH), "backups"),
  // The encryption salt (services/crypto.js) is needed to read a restored copy.
  saltPath: path.join(DB_DIR, "crypto.salt"),
});

// Move cluster configuration out of the JSON blob and into the cluster and cluster_node
const dryRun = process.argv.includes("--migrate-dry-run");
const clusterMigration = migrateClustersToTables(sqlite, { dryRun });

if (
  clusterMigration.reason === "invalid-blob" ||
  clusterMigration.reason === "verification-failed"
) {
  console.error(
    "  Cluster migration did not complete. CHOps will keep reading",
  );
  console.error("  the previous storage, so nothing is lost. Problems found:");
  for (const p of clusterMigration.problems) console.error("    - " + p);
  process.exitCode = 1;
}

// Seed defaults
const db = drizzle(sqlite, { schema });
const existing = db.select().from(schema.appSettings).all();
if (existing.length === 0) {
  db.insert(schema.appSettings)
    .values({ key: "app.name", value: "CHOps", category: "general" })
    .run();
  db.insert(schema.appSettings)
    .values({ key: "app.version", value: "6.0.0", category: "general" })
    .run();
  console.log("  Seeded default settings.");
}

// Seed super admin users from .env (argon2id)
const existingUsers = db.select().from(schema.appUsers).all();

// A fresh database with no admin configured leaves nobody able to log in, so
// this is a real misconfiguration and worth stopping for. Once users exist the
// variables are inert, which is why the check is here and not in loadEnv.
if (existingUsers.length === 0) {
  const hasNumbered =
    process.env.SUPER_ADMIN_1 &&
    process.env.SUPER_ADMIN_1_PASSWORD &&
    process.env.SUPER_ADMIN_1_EMAIL;
  const hasLegacy =
    process.env.SUPER_ADMIN &&
    process.env.SUPER_ADMIN_PASSWORD &&
    process.env.SUPER_ADMIN_EMAIL;
  if (!hasNumbered && !hasLegacy) {
    console.error(
      "  This database has no users, and no super admin is configured.",
    );
    console.error(
      "  Set SUPER_ADMIN_1, SUPER_ADMIN_1_PASSWORD and SUPER_ADMIN_1_EMAIL",
    );
    console.error(
      "  so the first account can be created, then start CHOps again.",
    );
    process.exit(1);
  }
}

if (existingUsers.length === 0) {
  let seeded = 0;
  for (let i = 1; i <= 3; i++) {
    const u = process.env[`SUPER_ADMIN_${i}`];
    const p = process.env[`SUPER_ADMIN_${i}_PASSWORD`];
    const em = process.env[`SUPER_ADMIN_${i}_EMAIL`];
    if (u && p && em) {
      const hash = await Bun.password.hash(p, {
        algorithm: "argon2id",
        memoryCost: 65536,
        timeCost: 2,
      });
      db.insert(schema.appUsers)
        .values({
          username: u,
          passwordHash: hash,
          role: "superadmin",
          mustChangePassword: false,
          email: em,
          initUser: true,
        })
        .run();
      console.log(`  Seeded super admin: ${u}`);
      seeded++;
    }
  }
  // Legacy fallback
  if (
    seeded === 0 &&
    process.env.SUPER_ADMIN &&
    process.env.SUPER_ADMIN_PASSWORD &&
    process.env.SUPER_ADMIN_EMAIL
  ) {
    const hash = await Bun.password.hash(process.env.SUPER_ADMIN_PASSWORD, {
      algorithm: "argon2id",
      memoryCost: 65536,
      timeCost: 2,
    });
    db.insert(schema.appUsers)
      .values({
        username: process.env.SUPER_ADMIN,
        passwordHash: hash,
        role: "superadmin",
        mustChangePassword: false,
        initUser: true,
        email: process.env.SUPER_ADMIN_EMAIL,
      })
      .run();
    console.log(`  Seeded super admin: ${process.env.SUPER_ADMIN}`);
  }
}

/** Check if 'init_user' is true; if not, initialize it to true.
 *
 * **Note**: This property is protected from subsequent user modifications and can only be updated internally or prior to application startup.*/
const checkEnvUserInitValue = () => {
  /** Tracking user update counts during multi-user configuration. */
  let initUsers = 0;

  for (let i = 1; i <= 3; i++) {
    const u = process.env[`SUPER_ADMIN_${i}`];
    const p = process.env[`SUPER_ADMIN_${i}_PASSWORD`];
    const em = process.env[`SUPER_ADMIN_${i}_EMAIL`];

    if (u && p && em) {
      const findEnvUser = db
        .select()
        .from(schema.appUsers)
        .where(eq(schema.appUsers.email, em.trim()))
        .get();

      if (findEnvUser) {
        if (!findEnvUser.initUser) {
          db.update(schema.appUsers)
            .set({ initUser: 1 })
            .where(eq(schema.appUsers.id, findEnvUser.id))
            .run();
        }
        initUsers++;
      }
    }
  }

  // Legacy fallback
  if (
    initUsers === 0 &&
    process.env.SUPER_ADMIN &&
    process.env.SUPER_ADMIN_PASSWORD &&
    process.env.SUPER_ADMIN_EMAIL
  ) {
    const findEnvUser = db
      .select()
      .from(schema.appUsers)
      .where(eq(schema.appUsers.email, process.env.SUPER_ADMIN_EMAIL.trim()))
      .get();

    if (findEnvUser && !findEnvUser.initUser) {
      db.update(schema.appUsers)
        .set({ initUser: 1 })
        .where(eq(schema.appUsers.id, findEnvUser.id))
        .run();
    }
  }
};

checkEnvUserInitValue();

console.log("  Database migration complete.");
sqlite.close();
