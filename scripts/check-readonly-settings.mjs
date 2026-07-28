// does this ClickHouse® server accept `readonly=1` on the same request as other settings?
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) {
      const key = cur.slice(2);
      const next = arr[i + 1];
      acc.push([key, next && !next.startsWith("--") ? next : "true"]);
    }
    return acc;
  }, []),
);

const HOST = args.host || "localhost";
const PORT = args.port || "8123";
const USER = args.user || "default";
const PASSWORD = args.password || "";
const PROTO = args.secure ? "https" : "http";
const BASE = `${PROTO}://${HOST}:${PORT}/`;

async function run(label, settings, sql = "SELECT 1") {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(settings)) url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-ClickHouse-User": USER, "X-ClickHouse-Key": PASSWORD },
      body: sql,
    });
    const text = (await res.text()).trim();
    if (!res.ok) {
      const code = /Code:\s*(\d+)/.exec(text)?.[1] ?? "?";
      return { label, ok: false, code, message: text.split("\n")[0].slice(0, 160) };
    }
    return { label, ok: true, body: text.slice(0, 60) };
  } catch (err) {
    return { label, ok: false, code: "net", message: err.message };
  }
}

function line(r) {
  const mark = r.ok ? "PASS" : "FAIL";
  const detail = r.ok ? r.body : `code ${r.code}: ${r.message}`;
  console.log(`  ${mark}  ${r.label.padEnd(48)} ${detail}`);
}

console.log(`\nClickHouse readonly/settings check -> ${BASE} as "${USER}"\n`);

// 0. Reachability, and what readonly this user's profile already carries.
const ping = await run("plain SELECT (no settings)", {});
line(ping);
if (!ping.ok) {
  console.log("\nCannot reach the server or authenticate. Nothing else to test.\n");
  process.exit(1);
}

const profile = await run(
  "profile readonly value",
  {},
  "SELECT value FROM system.settings WHERE name = 'readonly'",
);
line(profile);
const profileReadonly = profile.ok ? profile.body.trim() : "?";

console.log("");

// 1. The combination the application actually sends.
const CEILING = {
  max_result_bytes: String(128 * 1024 * 1024),
  result_overflow_mode: "break",
};

const results = [];
results.push(await run("readonly=1 alone", { readonly: 1 }));
results.push(await run("settings alone (no readonly)", CEILING));
results.push(await run("readonly=1 + settings  <-- what CHOps sends", { readonly: 1, ...CEILING }));
results.push(await run("readonly=2 + settings  <-- the proposed fix", { readonly: 2, ...CEILING }));
results.forEach(line);

// 2. readonly=2 permits SET, so confirm the app-level classifier still matters.
console.log("");
const setUnderTwo = await run(
  "SET under readonly=2 (expected to be allowed)",
  { readonly: 2 },
  "SET max_threads = 2",
);
line(setUnderTwo);
const writeUnderTwo = await run(
  "INSERT under readonly=2 (must be refused)",
  { readonly: 2 },
  "INSERT INTO system.one VALUES (1)",
);
line(writeUnderTwo);

// 3. Verdict.
const current = results[2];
const proposed = results[3];

console.log(`\n--- verdict ---\n`);
console.log(`  connecting user's profile readonly = ${profileReadonly}`);

if (current.ok) {
  console.log(`
  No change needed. This server accepts readonly=1 alongside the result
  ceiling, so services/clickhouse.js is correct as written for this
  deployment.`);
  if (profileReadonly === "0") {
    console.log(`
  Note: the profile readonly is 0 here. If you later point CHOps at a user
  whose profile sets readonly to 1 or 2, re-run this check - that is the
  configuration where the collision appears.`);
  }
} else if (proposed.ok) {
  console.log(`
  Change needed. readonly=1 is rejected alongside the ceiling settings
  (code ${current.code}), and readonly=2 is accepted.

  In src/backend/services/clickhouse.js:

      if (readOnly) url.searchParams.set('readonly', '2');

  readonly=2 blocks writes but permits setting changes. It does permit SET,
  which readonly=1 does not - but isReadOnlySql() in shared/sqlClassify.js
  already rejects SET as a leading keyword, so the app-level gate still
  covers it. Confirm the two probes above agree: SET allowed, INSERT refused.`);
} else {
  console.log(`
  Neither variant worked (readonly=1: code ${current.code}, readonly=2:
  code ${proposed.code}). That usually means the connecting user's profile
  already pins readonly, so the value cannot be changed per request at all.
  In that case drop the URL parameter entirely and rely on the profile plus
  isReadOnlySql(), rather than trying to set it here.`);
}

console.log("");
