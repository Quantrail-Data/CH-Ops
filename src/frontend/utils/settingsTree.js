// Builds the "where the settings come from" tree for View Grants > Settings
// in the TreeGraph format: { name, kind, tone, children }.
//
// user or role -> sources in the order ClickHouse applies them -> settings.
// Each setting is under the source that gives its final value.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { rootSource } from "./effectiveSettings.js";

// A key and a node for one source (default profile, TO profile, role or user).
function sourceKey(source) {
  if (source.kind === "role") return `role:${source.path.join(">")}`;
  return `${source.kind}:${source.name}`;
}

function sourceNode(source) {
  if (source.kind === "default") return { name: source.name, kind: "default profile", tone: "info" };
  if (source.kind === "to") return { name: source.name, kind: "profile (TO)", tone: "info" };
  if (source.kind === "role") return { name: source.path.join(" > "), kind: "role", tone: "warning" };
  return { name: source.name, kind: "own settings", tone: "accent" };
}

// result: the output of resolveEffectiveSettings.
export function buildSettingsSourceTree({ targetType, targetName, result, defaultProfileName }) {
  if (!targetName || !result) return null;

  // The sources in the order ClickHouse applies them.
  const orderedSources = [
    { kind: "default", name: defaultProfileName },
    ...result.profilesWithTo.map((profileName) => ({ kind: "to", name: profileName })),
    ...result.enabledRoles.map((role) => ({ kind: "role", name: role.name, path: role.path })),
  ];
  if (targetType === "user") orderedSources.push({ kind: "user", name: targetName });

  const settingsBySource = new Map(orderedSources.map((source) => [sourceKey(source), []]));
  for (const setting of result.settings) {
    if (setting.value === null || !setting.valueSource) continue;
    const key = sourceKey(rootSource(setting.valueSource));
    if (!settingsBySource.has(key)) continue;
    settingsBySource.get(key).push({
      name: `${setting.name} = ${setting.value}`,
      kind: setting.writability === "CONST" ? "const" : "setting",
      tone: setting.orderMayDiffer ? "warning" : "success",
    });
  }

  const children = orderedSources
    .filter((source) => settingsBySource.get(sourceKey(source)).length > 0)
    .map((source) => ({ ...sourceNode(source), children: settingsBySource.get(sourceKey(source)) }));

  return { name: targetName, kind: targetType, tone: "accent", children };
}
