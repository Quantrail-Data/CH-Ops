// Builds the trees for View Grants (User Grants and Role Grants) in the
// TreeGraph format: { name, kind, tone, children }.
//
// Input rows come from ClickHouse:
//   roleGrants  system.role_grants: user_name, role_name, granted_role_name
//   grants      system.grants: user_name, role_name, access_type, database,
//               table, column, is_partial_revoke
//
// Copyright (C) 2026 Quantrail™ Data Private Limited

// "SELECT.db.table.column", without the empty parts.
export function grantName(grant) {
  return [grant.access_type, grant.database, grant.table, grant.column].filter(Boolean).join(".");
}

function isPartialRevoke(grant) {
  return grant.is_partial_revoke === 1 || grant.is_partial_revoke === "1" || grant.is_partial_revoke === true;
}

function grantNode(grant) {
  if (isPartialRevoke(grant)) return { name: grantName(grant), kind: "revoke", tone: "danger" };
  return { name: grantName(grant), kind: "grant", tone: "success" };
}

// A role, the roles granted to it (again as trees) and its own grants.
// A role that is already on the path from the root is a circle: it is shown
// once as "circular" and not opened again, so the tree does not loop.
export function buildRoleNode(roleName, roleGrants, grants, rolesOnPath = new Set()) {
  if (rolesOnPath.has(roleName)) {
    return { name: roleName, kind: "circular", tone: "danger" };
  }
  const nextRolesOnPath = new Set(rolesOnPath);
  nextRolesOnPath.add(roleName);

  const childRoles = roleGrants
    .filter((row) => row.role_name === roleName)
    .map((row) => buildRoleNode(row.granted_role_name, roleGrants, grants, nextRolesOnPath));

  const ownGrants = grants.filter((grant) => grant.role_name === roleName).map(grantNode);

  const children = [...childRoles];
  if (ownGrants.length > 0) children.push({ name: "Grants", tone: "neutral", children: ownGrants });
  return { name: roleName, kind: "role", tone: "warning", children };
}

// The user, the roles granted to the user and the grants given to the user directly.
export function buildUserGrantTree(userName, roleGrants, grants) {
  const directRoles = roleGrants
    .filter((row) => row.user_name === userName)
    .map((row) => buildRoleNode(row.granted_role_name, roleGrants, grants));

  const directGrants = grants.filter((grant) => grant.user_name === userName).map(grantNode);

  const children = [];
  if (directRoles.length > 0) children.push({ name: "Roles", tone: "neutral", children: directRoles });
  if (directGrants.length > 0) children.push({ name: "Direct grants", tone: "neutral", children: directGrants });
  return { name: userName, kind: "user", tone: "accent", children };
}

// The role, the roles granted to it and its grants.
export function buildRoleGrantTree(roleName, roleGrants, grants) {
  return buildRoleNode(roleName, roleGrants, grants);
}
