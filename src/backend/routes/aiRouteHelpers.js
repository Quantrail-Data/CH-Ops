// aiRouteHelpers.js — shared by every routes/ai*.js file
import { CRED_CONTEXTS } from "../services/chCredStore.js";


// The default credential context, and the only other one a caller may ask for.
const VALID_CONTEXTS = new Set(Object.values(CRED_CONTEXTS));

export function resolveContext(req) {
  const requested = req.body?.context ?? req.query?.context;
  return VALID_CONTEXTS.has(requested) ? requested : CRED_CONTEXTS.QURIOZ;
}

// Normalise a selection into [{ database, table }], accepting either that shape
// or "db.table" strings, which is what a URL-driven client tends to send.
export function normaliseTables(tables) {
  if (!Array.isArray(tables)) return [];
  return tables
    .map((t) => {
      if (typeof t === "string") {
        const dot = t.indexOf(".");
        if (dot < 1) return null;
        return { database: t.slice(0, dot), table: t.slice(dot + 1) };
      }
      if (t?.database && t?.table) return { database: t.database, table: t.table };
      return null;
    })
    .filter(Boolean);
}

// Checks both spellings that exist in this codebase's error objects:
// AIServices throws { errorCode, statusCode }; hand-thrown Errors in this
// project use e.status or e.statusCode, inconsistently, depending on the file.
export function fail(res, e) {
  res.status(e?.statusCode || e?.status || 400).json({
    error: e?.message || "Request failed.",
    ...(e?.errorCode ? { code: e.errorCode } : e?.code ? { code: e.code } : {}),
  });
}


// 
export function notFound(res) {
  return res.status(404).json({ error: "Chat not found." });
}
