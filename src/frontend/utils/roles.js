// roles.js - One mapping from a CHOps app role to its badge tone.
//
// Style guide (User Management): superadmin indigo, admin amber, editor cyan,
// readonly neutral. Every role pill in the app reads from here, so the navbar
// and the users table cannot drift apart.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

export const ROLE_TONE = {
  superadmin: "accent",
  admin: "warning",
  editor: "info",
  readonly: "neutral",
};

/** Badge tone for a role; unknown roles are neutral. */
export function roleTone(role) {
  return ROLE_TONE[role] || "neutral";
}
