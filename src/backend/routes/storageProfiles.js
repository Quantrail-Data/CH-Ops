import { Router } from "express";
import { db } from "../db";
import { appSettings } from "../db/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../services/crypto";
import { requireAdmin } from "../controllers/users.js";

const router = Router();

// Escapes a value for a ClickHouse string literal. A quote in a key must not end the string.
function sqlText(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// The query that the Test button runs. One "/" joins the endpoint and the bucket.
export function testingSQLQueryCMD(profile) {
  if (profile.type !== "s3" && profile.type !== "gcs") return "SELECT 1";
  let endpoint = "https://storage.googleapis.com";
  if (profile.type === "s3") {
    endpoint = (profile.endpoint || "https://s3.amazonaws.com").replace(/\/+$/, "");
  }
  const probeUrl = `${endpoint}/${profile.bucket}/test_connection_probe`;
  return `SELECT 1 FROM s3('${sqlText(probeUrl)}', '${sqlText(profile.accessKeyId)}', '${sqlText(profile.accessKey)}', 'csv') LIMIT 0`;
}

router.get("/testing/:id", requireAdmin, (req, res, next) => {
  try {
    const id = Number(req?.params?.id);

    if (!id) {
      const err = new Error("ID is must to test the connection!");
      err.statusCode = 422;
      throw err;
    }

    const data = db
      .select()
      .from(appSettings)
      .where(eq(appSettings?.key, "backup_profiles"))
      .get();

    const value = JSON.parse(data?.value || "[]");

    const find = value?.filter((_find) => _find?.id === id);

    if (find?.length === 0) {
      const err = new Error("Data not found for the provided ID");
      err.statusCode = 404;
      throw err;
    }

    let val = find[0];

    Object.keys(val)?.forEach((_v) => {
      if (_v === "accessKeyId" || _v === "accessKey" || _v === "endpoint") {
        val[_v] = decrypt(val[_v]);
      }
    });

    const TestingSqlQuery = testingSQLQueryCMD(val);

    const encryptSQL = encrypt(TestingSqlQuery);

    res.status(201).json({ _encrypt: encryptSQL });
  } catch (err) {
    next(err);
  }
});

router.put("/profiles/update/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req?.params?.id);

    if (!id) {
      const err = new Error("ID is must to update the connection!");
      err.statusCode = 422;
      throw err;
    }

    const { name, type, bucket, region } = req.body;

    let obj = { name, type, bucket, region };

    const find = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "backup_profiles"))
      .get();

    let value = JSON.parse(find?.value || "[]");

    value = value?.map((_v) => {
      if (_v?.id === id) {
        return { ..._v, ...obj };
      }
      return _v;
    });

    await db
      .update(appSettings)
      .set({ value: JSON.stringify(value) })
      .where(eq(appSettings?.key, "backup_profiles"));

    return res?.json(value);
  } catch (err) {
    next(err);
  }
});

router.delete("/profiles/delete/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req?.params?.id);

    if (!id) {
      const err = new Error("ID is must to delete the connection!");
      err.statusCode = 422;
      throw err;
    }

    const find = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "backup_profiles"))
      .get();

    let value = JSON.parse(find?.value || "[]");

    const removed = value?.filter((_find) => _find?.id !== id);
    await db
      .update(appSettings)
      .set({ value: JSON.stringify(removed) })
      .where(eq(appSettings?.key, "backup_profiles"));
    res.status(201).json({ removed });
  } catch (err) {
    next(err);
  }
});

export default router;
