// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Implements 4-tier RBAC user management, restricting hierarchical role modifications and credential updates by access level.

import { randomBytes } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db, appUsers } from "../db/index.js";
import { sendNotification } from "../services/notifier.js";
import { revokeToken } from "../services/jwt.js";
import { loadEnv } from "../utils/env.js";
import { getClusterById, getNodeByName } from "../services/clusterUtils.js";

const VALID_ROLES = ["superadmin", "admin", "editor", "readonly"];

// Role hierarchy: higher number = more privilege
const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };

async function hashPassword(pw) {
  return Bun.password.hash(pw, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });
}

function generatePassword() {
  return randomBytes(16).toString("base64url");
}

// Returns true if the caller has admin-level access (superadmin or admin)
function isAdminLevel(role) {
  return role === "superadmin" || role === "admin";
}

// Can the caller change the target user's role?
// Rules: can't promote above own level, can't change someone at or above own level
function canChangeRole(callerRole, targetCurrentRole, targetNewRole) {
  const callerLevel = ROLE_LEVEL[callerRole] || 0;
  const targetLevel = ROLE_LEVEL[targetCurrentRole] || 0;
  const newLevel = ROLE_LEVEL[targetNewRole] || 0;

  // Can't touch someone at or above your level
  if (targetLevel >= callerLevel) return false;
  // Can't promote to your level or above
  if (newLevel >= callerLevel) return false;
  return true;
}

// -- Middleware --

// Blocks anyone below admin level. Used on user management write routes.
export function requireAdmin(req, res, next) {
  if (!isAdminLevel(req.user?.role))
    return res.status(403).json({ error: "Admin access required." });
  next();
}

// Blocks anyone below admin level. Kept for backward compatibility with
// routes that already use this name (alerts, backups, cluster, settings).
export function requireSuperAdmin(req, res, next) {
  if (!isAdminLevel(req.user?.role))
    return res.status(403).json({ error: "Admin access required." });
  next();
}

// Blocks readonly users. Used on routes where editors can write.
export function requireEditor(req, res, next) {
  const level = ROLE_LEVEL[req.user?.role] || 0;
  if (level < ROLE_LEVEL.editor)
    return res.status(403).json({ error: "Editor access required." });
  next();
}

// -- Handlers --

export function listUsers(req, res) {
  const users = db
    .select({
      id: appUsers.id,
      username: appUsers.username,
      role: appUsers.role,
      email: appUsers.email,
      mustChangePassword: appUsers.mustChangePassword,
      lastLoginAt: appUsers.lastLoginAt,
      createdAt: appUsers.createdAt,
    })
    .from(appUsers)
    .orderBy(desc(appUsers.createdAt))
    .all();
  res.json(users);
}

export async function createUser(req, res) {
  try {
    // Only admin-level users can create new users
    if (!isAdminLevel(req.user?.role))
      return res.status(403).json({ error: "Admin access required." });

    const { username, email, role } = req.body;
    if (!username?.trim())
      return res.status(400).json({ error: "Username required." });

    const existing = db
      .select()
      .from(appUsers)
      .where(eq(appUsers.username, username.trim()))
      .get();
    if (existing)
      return res.status(409).json({ error: "Username already exists." });

    // Validate and constrain the role
    let newRole = VALID_ROLES.includes(role) ? role : "readonly";

    // Only superadmins can create other superadmins
    if (newRole === "superadmin" && req.user?.role !== "superadmin") {
      return res
        .status(403)
        .json({ error: "Only super admins can create super admin accounts." });
    }

    // Admins can create admin, editor, readonly but not superadmin
    if (newRole === "admin" && req.user?.role === "admin") {
      // admins can create other admins - that's fine
    }

    // Max 3 superadmins
    if (newRole === "superadmin") {
      const count = db
        .select()
        .from(appUsers)
        .all()
        .filter((u) => u.role === "superadmin").length;
      if (count >= 3)
        return res
          .status(400)
          .json({ error: "Maximum 3 super admins allowed." });
    }

    const password = generatePassword();
    const hash = await hashPassword(password);
    const user = db
      .insert(appUsers)
      .values({
        username: username.trim(),
        passwordHash: hash,
        role: newRole,
        email: email || null,
        mustChangePassword: true,
      })
      .returning()
      .get();

    // Email the generated password if SMTP is configured
    if (email) {
      try {
        const env = loadEnv();
        const smtp = env.smtp;
        if (smtp.host) {
          const emailConfig = {
            type: "email",
            smtp_host: smtp.host,
            smtp_port: smtp.port,
            smtp_user: smtp.user,
            smtp_pass: smtp.pass,
            from: smtp.from,
            to: email,
          };
          sendNotification(emailConfig, {
            name: "CHOps Account Created",
            severity: "info",
            description: `Your CHOps account has been created.\n\nUsername: ${username.trim()}\nPassword: ${password}\nRole: ${newRole}\n\nPlease change your password on first login.`,
            sql: "",
            schedule: "",
            operator: "eq",
            threshold: 0,
            lastValue: 0,
            lastRunAt: new Date().toISOString(),
          }).catch(() => {});
        }
      } catch {}
    }

    res
      .status(201)
      .json({ ...user, generatedPassword: password, passwordHash: undefined });
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export async function updateUser(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const isSelf = req.user?.userId === id;
    const callerIsAdmin = isAdminLevel(req.user?.role);
    if (!isSelf && !callerIsAdmin)
      return res.status(403).json({ error: "Access denied." });

    const target = db.select().from(appUsers).where(eq(appUsers.id, id)).get();
    if (!target) return res.status(404).json({ error: "User not found." });

    const updates = {};
    if (req.body.email !== undefined) updates.email = req.body.email;

    // Role change: enforce hierarchy rules
    if (req.body.role !== undefined && req.body.role !== target.role) {
      const newRole = req.body.role;
      if (!VALID_ROLES.includes(newRole)) {
        return res
          .status(400)
          .json({
            error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
          });
      }
      if (!canChangeRole(req.user?.role, target.role, newRole)) {
        return res
          .status(403)
          .json({
            error: "You do not have permission to change this user's role.",
          });
      }
      // Max 3 superadmins
      if (newRole === "superadmin") {
        const count = db
          .select()
          .from(appUsers)
          .all()
          .filter((u) => u.role === "superadmin").length;
        if (count >= 3)
          return res
            .status(400)
            .json({ error: "Maximum 3 super admins allowed." });
      }
      updates.role = newRole;
    }

    // Password reset: only admin-level users can reset others' passwords
    if (req.body.resetPassword && callerIsAdmin && !isSelf) {
      const pw = generatePassword();
      updates.passwordHash = await hashPassword(pw);
      updates.mustChangePassword = true;
      db.update(appUsers).set(updates).where(eq(appUsers.id, id)).run();
      return res.json({ ok: true, generatedPassword: pw });
    }

    if (Object.keys(updates).length > 0) {
      db.update(appUsers).set(updates).where(eq(appUsers.id, id)).run();
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json(error.message);
  }
}

export function deleteUser(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.user?.userId === id)
      return res.status(400).json({ error: "Cannot delete yourself." });

    // Check that caller has permission to delete this user
    const target = db.select().from(appUsers).where(eq(appUsers.id, id)).get();
    if (!target) return res.status(404).json({ error: "User not found." });

    // Can't delete someone at or above your level
    const callerLevel = ROLE_LEVEL[req.user?.role] || 0;
    const targetLevel = ROLE_LEVEL[target.role] || 0;
    if (targetLevel >= callerLevel) {
      return res
        .status(403)
        .json({
          error: "Cannot delete a user with equal or higher privileges.",
        });
    }

    db.delete(appUsers).where(eq(appUsers.id, id)).run();
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json(error.message);
  }
}
