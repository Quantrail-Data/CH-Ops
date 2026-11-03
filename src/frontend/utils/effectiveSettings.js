// effectiveSettings.js - Finds the ClickHouse settings that apply to a user or a role.
// Copyright (C) 2026 Quantrail Data Private Limited
//
// ClickHouse has no system table with the effective settings of another user, so CHOps
// finds them from the system tables. The steps follow the ClickHouse source
// (src/Access/resolveEffectiveSettings.cpp) and keep its function names:
//   1. the default profile of the server,
//   2. the profiles whose TO clause matches the user or one of its enabled roles,
//   3. the settings of the enabled roles, each role before the roles granted to it,
//   4. the user's own settings.
// A later element overrides an earlier one.

const ALLOW_BACKUP_SETTING = "allow_backup";

// Orders names by the id of the role. ClickHouse keeps roles in a set sorted by id.
function sortRoleNamesById(roleNames, roleIdByName) {
  return [...roleNames].sort((first, second) =>
    String(roleIdByName.get(first) ?? first).localeCompare(String(roleIdByName.get(second) ?? second)),
  );
}

// Returns the enabled roles in the order that ClickHouse merges their settings.
// startGrants are the role grants of the user (or one grant for the role itself).
export function collectRoles(startGrants, roleGrants, roleIdByName) {
  const enabledRoles = [];
  const seenRoles = new Set();

  function visitRole(roleName, path) {
    if (seenRoles.has(roleName) || !roleIdByName.has(roleName)) return;
    seenRoles.add(roleName);
    enabledRoles.push({ name: roleName, path });

    const grantsOfRole = roleGrants.filter((grant) => grant.role_name === roleName);
    for (const grantedRoleName of grantedRoleNamesInOrder(grantsOfRole, roleIdByName)) {
      visitRole(grantedRoleName, [...path, grantedRoleName]);
    }
  }

  for (const roleName of grantedRoleNamesInOrder(startGrants, roleIdByName)) {
    visitRole(roleName, [roleName]);
  }
  return enabledRoles;
}

// ClickHouse visits the roles granted without ADMIN OPTION first, then the others.
function grantedRoleNamesInOrder(grants, roleIdByName) {
  const withoutAdminOption = grants.filter((grant) => !Number(grant.with_admin_option));
  const withAdminOption = grants.filter((grant) => Number(grant.with_admin_option));
  return [
    ...sortRoleNamesById(withoutAdminOption.map((grant) => grant.granted_role_name), roleIdByName),
    ...sortRoleNamesById(withAdminOption.map((grant) => grant.granted_role_name), roleIdByName),
  ];
}

// True when the TO clause of a profile covers the target. targetNames holds the user name
// (for a user) and the names of all enabled roles.
export function profileAppliesTo(profile, targetNames) {
  const applyToList = profile.apply_to_list || [];
  const applyToExcept = profile.apply_to_except || [];
  const isListed = Number(profile.apply_to_all) === 1 || targetNames.some((name) => applyToList.includes(name));
  const isExcepted = targetNames.some((name) => applyToExcept.includes(name));
  return isListed && !isExcepted;
}

// Turns the rows of system.settings_profile_elements of one owner into elements.
function elementsOfOwner(elementRows, ownerColumn, ownerName, source) {
  return elementRows
    .filter((row) => row[ownerColumn] === ownerName)
    .sort((first, second) => Number(first.index) - Number(second.index))
    .map((row) => ({
      settingName: row.setting_name || null,
      value: row.value ?? null,
      min: row.min ?? null,
      max: row.max ?? null,
      writability: row.writability ?? null,
      inheritProfile: row.inherit_profile || null,
      source,
    }));
}

// Builds the list of elements for a user or a role, before profiles are expanded.
// target is { type: "user" | "role", name }.
export function resolveSettingsProfileElements({ target, data, defaultProfileName, useAllGrantedRoles }) {
  const roleIdByName = new Map(data.roles.map((role) => [role.name, role.id]));

  let startGrants;
  if (target.type === "user") {
    startGrants = data.roleGrants.filter(
      (grant) => grant.user_name === target.name && (useAllGrantedRoles || Number(grant.granted_role_is_default) === 1),
    );
  } else {
    startGrants = [{ granted_role_name: target.name, with_admin_option: 0 }];
  }
  const enabledRoles = collectRoles(startGrants, data.roleGrants, roleIdByName);

  const elements = [];
  if (defaultProfileName) {
    elements.push({ inheritProfile: defaultProfileName, source: { kind: "default", name: defaultProfileName } });
  }

  const targetNames = [...(target.type === "user" ? [target.name] : []), ...enabledRoles.map((role) => role.name)];
  const profilesWithTo = data.profiles
    .filter((profile) => profileAppliesTo(profile, targetNames))
    .sort((first, second) => first.name.localeCompare(second.name));
  for (const profile of profilesWithTo) {
    elements.push({ inheritProfile: profile.name, source: { kind: "to", name: profile.name } });
  }

  for (const role of enabledRoles) {
    elements.push(...elementsOfOwner(data.elements, "role_name", role.name, { kind: "role", name: role.name, path: role.path }));
  }
  if (target.type === "user") {
    elements.push(...elementsOfOwner(data.elements, "user_name", target.name, { kind: "user", name: target.name }));
  }

  return { elements, enabledRoles, profilesWithTo: profilesWithTo.map((profile) => profile.name) };
}

// Replaces each inherited profile with its elements, at the same place. When a profile is
// reached more than once, only the last place counts, as in ClickHouse.
export function substituteProfiles(elements, elementRows, knownProfileNames) {
  const result = [...elements];
  const substitutedProfiles = new Set();
  const missingProfiles = new Set();

  let position = result.length;
  while (position > 0) {
    position -= 1;
    const element = result[position];
    if (!element.inheritProfile) continue;

    const profileName = element.inheritProfile;
    result[position] = { ...element, inheritProfile: null };
    if (substitutedProfiles.has(profileName)) continue;

    if (!knownProfileNames.has(profileName)) {
      missingProfiles.add(profileName);
      continue;
    }
    const profileSource = { kind: "profile", name: profileName, via: element.source };
    const profileElements = elementsOfOwner(elementRows, "profile_name", profileName, profileSource);

    result.splice(position, 0, ...profileElements);
    position += profileElements.length;
    substitutedProfiles.add(profileName);
  }

  return { elements: result, missingProfiles: [...missingProfiles] };
}

// The first source in the chain: default profile, a TO profile, a role or the user.
export function rootSource(source) {
  let current = source;
  while (current?.via) current = current.via;
  return current;
}

// True when ClickHouse could merge the two sources in a different order. That is the case
// for two TO profiles, and for two roles that do not reach each other.
function orderMayDiffer(earlierSource, laterSource) {
  const earlierRoot = rootSource(earlierSource);
  const laterRoot = rootSource(laterSource);
  if (!earlierRoot || !laterRoot || earlierRoot.kind !== laterRoot.kind) return false;
  if (earlierRoot.kind === "to") return earlierRoot.name !== laterRoot.name;
  if (earlierRoot.kind === "role") return earlierRoot.path[0] !== laterRoot.path[0];
  return false;
}

function isConstraint(element) {
  return element.min !== null || element.max !== null || element.writability !== null;
}

// Combines the elements into one entry for each setting. aliasFor maps an alias name to the
// setting name. replacePrevious is the server option settings_constraints_replace_previous.
export function foldElements(elements, { aliasFor = new Map(), replacePrevious = true } = {}) {
  const settings = new Map();

  for (const element of elements) {
    if (!element.settingName) continue;
    const settingName = aliasFor.get(element.settingName) || element.settingName;
    if (settingName === ALLOW_BACKUP_SETTING) continue;

    if (!settings.has(settingName)) {
      settings.set(settingName, {
        name: settingName,
        value: null,
        valueSource: null,
        min: null,
        max: null,
        writability: null,
        constraintSource: null,
        overriddenValues: [],
        orderMayDiffer: false,
      });
    }
    const setting = settings.get(settingName);

    if (element.value !== null) {
      if (setting.value !== null) {
        setting.overriddenValues.push({ value: setting.value, source: setting.valueSource });
        if (orderMayDiffer(setting.valueSource, element.source)) setting.orderMayDiffer = true;
      }
      setting.value = element.value;
      setting.valueSource = element.source;
    }

    if (!isConstraint(element)) continue;
    setting.constraintSource = element.source;
    if (replacePrevious) {
      setting.min = element.min;
      setting.max = element.max;
      setting.writability = element.writability ?? "WRITABLE";
    } else {
      if (element.min !== null) setting.min = element.min;
      if (element.max !== null) setting.max = element.max;
      if (element.writability === "CONST") setting.writability = "CONST";
    }
  }

  // A plain WRITABLE without min or max is no constraint at all.
  for (const setting of settings.values()) {
    if (setting.writability === "WRITABLE" && setting.min === null && setting.max === null) {
      setting.writability = null;
    }
  }

  return [...settings.values()].sort((first, second) => first.name.localeCompare(second.name));
}

// Runs all steps for one user or role.
// data holds the rows of: roles (name, id), roleGrants, profiles, elements, and settings
// (name, alias_for) from system.settings.
export function resolveEffectiveSettings({ target, data, defaultProfileName = "default", useAllGrantedRoles = true, replacePrevious = true }) {
  const resolved = resolveSettingsProfileElements({ target, data, defaultProfileName, useAllGrantedRoles });
  const knownProfileNames = new Set(data.profiles.map((profile) => profile.name));
  const substituted = substituteProfiles(resolved.elements, data.elements, knownProfileNames);

  const aliasFor = new Map(
    (data.settings || []).filter((setting) => setting.alias_for).map((setting) => [setting.name, setting.alias_for]),
  );
  const settings = foldElements(substituted.elements, { aliasFor, replacePrevious });

  return {
    settings,
    enabledRoles: resolved.enabledRoles,
    profilesWithTo: resolved.profilesWithTo,
    missingProfiles: substituted.missingProfiles,
  };
}

// A short text for a source, for example: profile "analysts", via role "reporting".
export function describeSource(source) {
  if (!source) return "";
  const parts = [];
  let current = source;
  while (current) {
    // A profile that comes from a TO clause or the default profile is named once.
    const isSameProfileAsVia =
      current.kind === "profile" && ["to", "default"].includes(current.via?.kind) && current.via.name === current.name;
    if (isSameProfileAsVia) {
      current = current.via;
      continue;
    }
    if (current.kind === "default") parts.push(`default profile "${current.name}"`);
    if (current.kind === "to") parts.push(`profile "${current.name}" (TO clause)`);
    if (current.kind === "profile") parts.push(`profile "${current.name}"`);
    if (current.kind === "role") parts.push(`role "${current.path.join(" > ")}"`);
    if (current.kind === "user") parts.push(`user "${current.name}"`);
    current = current.via;
  }
  return parts.join(", via ");
}
