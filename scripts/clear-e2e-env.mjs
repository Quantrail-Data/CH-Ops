// Teardown for the e2e suite - removes the throwaway generated env file and
// the saved login session tied to it. Run unconditionally after `playwright
// test`, whether the run passed or failed, so no generated secret or stale
// session ever lingers on disk.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { rmSync } from "fs";

for (const path of ["tests/e2e/.env.e2e", "tests/e2e/.auth"]) {
  rmSync(path, { recursive: true, force: true });
}
console.log("[clear-e2e-env] removed tests/e2e/.env.e2e and tests/e2e/.auth");
