// appBackup.js - Application data backup REST API
//
// All endpoints require superadmin access. POST /create triggers
// a manual backup to the specified storage profile. GET /list
// lists existing backups from S3. GET/PUT /config manages the
// scheduled backup configuration (enabled, profile, frequency, hour).
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from "express";
import { requireSuperAdmin } from "../controllers/users.js";
import { createAppBackup, listAppBackups } from "../services/appBackup.js";
import { eq } from "drizzle-orm";
import { db, appSettings } from "../db/index.js";
import { getClusterById, getNodeByName } from "../services/clusterUtils.js";

const router = Router();

// Create a manual backup now
router.post("/create", requireSuperAdmin, async (req, res) => {

  try {
    const { profileName } = req.body;
    if (!profileName)
      return res.status(400).json({ error: "profileName is required" });
    const manifest = await createAppBackup(profileName, "manual");

    res.json(manifest);
  } catch (error) {

    res.status(500).json(error.message);
  }
});

// List existing backups for a profile
router.get("/list", requireSuperAdmin, async (req, res) => {
  try {
    const profileName = req.query.profile;
    if (!profileName)
      return res.status(400).json({ error: "profile query param is required" });
    const backups = await listAppBackups(profileName);
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get scheduled backup config
router.get("/config", requireSuperAdmin, (req, res) => {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "app_backup_config"))
    .get();
  if (!row?.value)
    return res.json({
      enabled: false,
      profileName: "",
      frequency: "daily",
      backupHour: 2,
      weekday: 0,
    });
  try {
    res.json(JSON.parse(row.value));
  } catch {
    res.json({ enabled: false });
  }
});

// Save scheduled backup config
router.put("/config", requireSuperAdmin, (req, res) => {
  try {
    const config = {
      enabled: !!req.body.enabled,
      profileName: req.body.profileName || "",
      frequency: req.body.frequency || "daily",
      backupHour: req.body.backupHour ?? 2,
      weekday: req.body.weekday ?? 0,
      // Preserve last run info
      lastRunAt: req.body.lastRunAt || null,
      lastRunStatus: req.body.lastRunStatus || null,
      lastRunError: req.body.lastRunError || null,
      lastBackupId: req.body.lastBackupId || null,
    };

    const existing = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "app_backup_config"))
      .get();
    if (existing) {
      db.update(appSettings)
        .set({ value: JSON.stringify(config) })
        .where(eq(appSettings.id, existing.id))
        .run();
    } else {
      db.insert(appSettings)
        .values({
          key: "app_backup_config",
          value: JSON.stringify(config),
          category: "backups",
        })
        .run();
    }


    res.json(config);
  } catch (error) {
    res.status(500).json(error.message);
  }
});

export default router;
