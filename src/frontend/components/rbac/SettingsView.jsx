// SettingsView.jsx - The Settings tab of View Grants: the effective settings of a user or a role.
// Copyright (C) 2026 Quantrail Data Private Limited

import { useEffect, useMemo, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import DataTable from "../layout/DataTable.jsx";
import { runQuery, apiFetch } from "../../utils/api.js";
import { resolveEffectiveSettings, describeSource } from "../../utils/effectiveSettings.js";

// The system tables this tab reads. None of the SQL contains user input.
const QUERIES = {
  users: "SELECT name FROM system.users ORDER BY name",
  roles: "SELECT name, toString(id) AS id FROM system.roles ORDER BY name",
  roleGrants:
    "SELECT user_name, role_name, granted_role_name, granted_role_is_default, with_admin_option FROM system.role_grants",
  profiles: "SELECT name, apply_to_all, apply_to_list, apply_to_except FROM system.settings_profiles",
  elements:
    "SELECT profile_name, user_name, role_name, index, setting_name, value, min, max, toString(writability) AS writability, inherit_profile FROM system.settings_profile_elements",
  settings: "SELECT name, alias_for, description, `default` FROM system.settings",
};

const TABLE_NAMES = {
  users: "system.users",
  roles: "system.roles",
  roleGrants: "system.role_grants",
  profiles: "system.settings_profiles",
  elements: "system.settings_profile_elements",
  settings: "system.settings",
};

// ClickHouse arrays can arrive as JSON text. The resolver needs real arrays.
function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Reads all tables at the same time. A table that fails gives an empty list and an error.
export async function loadSettingsData(runSql = runQuery) {
  const names = Object.keys(QUERIES);
  const results = await Promise.allSettled(names.map((name) => runSql(QUERIES[name], { readOnly: true })));

  const data = {};
  const errors = [];
  names.forEach((name, position) => {
    const result = results[position];
    if (result.status === "fulfilled") {
      data[name] = result.value?.rows || [];
    } else {
      data[name] = [];
      errors.push(`${TABLE_NAMES[name]}: ${result.reason?.message || "the query failed."}`);
    }
  });

  data.profiles = data.profiles.map((profile) => ({
    ...profile,
    apply_to_list: toArray(profile.apply_to_list),
    apply_to_except: toArray(profile.apply_to_except),
  }));
  return { data, errors };
}

const DEFAULT_CONFIG = { defaultProfileName: "default", settingsConstraintsReplacePrevious: true };

export default function SettingsView() {
  const [data, setData] = useState(null);
  const [loadErrors, setLoadErrors] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const [targetType, setTargetType] = useState("user");
  const [targetName, setTargetName] = useState("");
  const [useAllGrantedRoles, setUseAllGrantedRoles] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const [loaded, loadedConfig] = await Promise.all([
      loadSettingsData(),
      apiFetch("/api/app-config/rbac-settings").catch(() => DEFAULT_CONFIG),
    ]);
    setData(loaded.data);
    setLoadErrors(loaded.errors);
    setConfig(loadedConfig);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const result = useMemo(() => {
    if (!data || !targetName) return null;
    return resolveEffectiveSettings({
      target: { type: targetType, name: targetName },
      data,
      defaultProfileName: config.defaultProfileName,
      useAllGrantedRoles,
      replacePrevious: config.settingsConstraintsReplacePrevious,
    });
  }, [data, targetType, targetName, useAllGrantedRoles, config]);

  const settingInfoByName = useMemo(
    () => new Map((data?.settings || []).map((setting) => [setting.name, setting])),
    [data],
  );

  const names = targetType === "user" ? data?.users || [] : data?.roles || [];
  const ownerColumn = targetType === "user" ? "user_name" : "role_name";
  const searchText = search.trim().toLowerCase();

  const effectiveRows = (result?.settings || [])
    .filter((setting) => setting.name.toLowerCase().includes(searchText))
    .map((setting) => ({
      setting: setting.name,
      value: setting.value ?? "",
      min: setting.min ?? "",
      max: setting.max ?? "",
      writability: setting.writability ?? "",
      source: describeSource(setting.valueSource || setting.constraintSource),
      overrides: setting.overriddenValues.length,
      details: setting,
    }));

  const directRows = (data?.elements || [])
    .filter((row) => row[ownerColumn] === targetName)
    .sort((first, second) => Number(first.index) - Number(second.index));

  function changeTargetType(newType) {
    setTargetType(newType);
    setTargetName("");
  }

  if (loading && !data) return <div className="loading-spinner" />;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <Select className="form-select" value={targetType} onChange={(event) => changeTargetType(event.target.value)}>
          <option value="user">User</option>
          <option value="role">Role</option>
        </Select>
        <Select className="form-select" value={targetName} onChange={(event) => setTargetName(event.target.value)}>
          <option value="">{targetType === "user" ? "Select a user" : "Select a role"}</option>
          {names.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </Select>
        {targetType === "user" && (
          <Select
            className="form-select"
            value={useAllGrantedRoles ? "all" : "default"}
            onChange={(event) => setUseAllGrantedRoles(event.target.value === "all")}
          >
            <option value="all">All granted roles</option>
            <option value="default">Default roles only (as at login)</option>
          </Select>
        )}
        <input
          className="form-input"
          placeholder="Search settings"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ width: 200 }}
        />
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <Icon className="ti ti-refresh"></Icon> Refresh
        </button>
      </div>

      {loadErrors.length > 0 && (
        <div className="alert-banner warning" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-alert-triangle"></Icon>
          <span>
            Some tables could not be read, so the result can be incomplete. Check that the CHOps
            service account has SHOW USERS, SHOW ROLES and SHOW SETTINGS PROFILES.{" "}
            {loadErrors.join(" ")}
          </span>
        </div>
      )}

      {!targetName && (
        <div className="empty-state">
          <Icon className="ti ti-adjustments"></Icon>
          <p>Select a {targetType} to see its settings.</p>
        </div>
      )}

      {result && (
        <>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>
            {`CHOps applies the settings in the ClickHouse order: the default profile "${config.defaultProfileName}", ` +
              "the profiles with a TO clause, the roles, and then the settings of the user. A later source overrides an " +
              "earlier one. The default profile name and the constraint mode come from Control panel > App Config > DB RBAC."}
          </p>

          {result.missingProfiles.length > 0 && (
            <div className="alert-banner warning" style={{ marginBottom: 10 }}>
              <Icon className="ti ti-alert-triangle"></Icon>
              <span>
                These profiles do not exist, so ClickHouse skips them: {result.missingProfiles.join(", ")}.
              </span>
            </div>
          )}

          <h3 style={{ fontSize: 15, margin: "8px 0" }}>Effective settings</h3>
          <DataTable
            rows={effectiveRows}
            columns={["setting", "value", "min", "max", "writability", "source", "overrides"]}
            emptyMessage={`No settings apply to ${targetName} other than the ClickHouse built-in defaults.`}
            variant="fixed"
            cellRenderers={{
              setting: (value) => {
                const info = settingInfoByName.get(value);
                const tooltip = info ? `${info.description}\nBuilt-in default: ${info.default}` : "";
                return <span title={tooltip}>{value}</span>;
              },
              source: (value, row) => (
                <span>
                  {value}
                  {row.details.orderMayDiffer && (
                    <span
                      title="Two profiles with a TO clause, or two roles that do not reach each other, set this setting. ClickHouse merges them in the order of their internal ids, so the value can differ."
                      style={{ color: "var(--color-warning)", marginLeft: 6 }}
                    >
                      <Icon className="ti ti-alert-triangle"></Icon>
                    </span>
                  )}
                </span>
              ),
              overrides: (value, row) => (
                <span
                  title={row.details.overriddenValues
                    .map((item) => `${item.value} from ${describeSource(item.source)}`)
                    .join("\n")}
                >
                  {value}
                </span>
              ),
            }}
          />

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Sources, in the order ClickHouse applies them</h3>
          <ol style={{ fontSize: 13, margin: "0 0 0 18px", lineHeight: 1.8 }}>
            <li>{`Default profile "${config.defaultProfileName}"`}</li>
            {result.profilesWithTo.map((profileName) => (
              <li key={`to-${profileName}`}>{`Profile "${profileName}" (TO clause)`}</li>
            ))}
            {result.enabledRoles.map((role) => (
              <li key={`role-${role.name}`}>{`Role "${role.path.join(" > ")}"`}</li>
            ))}
            {targetType === "user" && <li>{`User "${targetName}"`}</li>}
          </ol>

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Rows of system.settings_profile_elements for {targetName}</h3>
          <DataTable
            rows={directRows}
            columns={["index", "setting_name", "value", "min", "max", "writability", "inherit_profile"]}
            emptyMessage={`${targetName} has no settings and no profiles of its own.`}
            variant="fixed"
          />
        </>
      )}
    </div>
  );
}
