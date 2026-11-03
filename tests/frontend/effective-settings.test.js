// effective-settings.test.js - The effective settings follow the ClickHouse order of sources.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "vitest";
import {
  resolveEffectiveSettings,
  substituteProfiles,
  foldElements,
  profileAppliesTo,
  describeSource,
} from "../../src/frontend/utils/effectiveSettings.js";

// One row of system.settings_profile_elements. owner is { profile }, { user } or { role }.
function elementRow(owner, index, fields) {
  return {
    profile_name: owner.profile ?? null,
    user_name: owner.user ?? null,
    role_name: owner.role ?? null,
    index,
    setting_name: fields.setting ?? null,
    value: fields.value ?? null,
    min: fields.min ?? null,
    max: fields.max ?? null,
    writability: fields.writability ?? null,
    inherit_profile: fields.inherit ?? null,
  };
}

function profile(name, applyTo = {}) {
  return {
    name,
    apply_to_all: applyTo.all ? 1 : 0,
    apply_to_list: applyTo.list ?? [],
    apply_to_except: applyTo.except ?? [],
  };
}

function roleGrant(grantee, roleName, options = {}) {
  return {
    user_name: grantee.user ?? null,
    role_name: grantee.role ?? null,
    granted_role_name: roleName,
    granted_role_is_default: options.isDefault === false ? 0 : 1,
    with_admin_option: options.withAdminOption ? 1 : 0,
  };
}

function emptyData() {
  return { roles: [], roleGrants: [], profiles: [profile("default")], elements: [], settings: [] };
}

function settingOf(result, name) {
  return result.settings.find((setting) => setting.name === name);
}

const alice = { type: "user", name: "alice" };

describe("effective settings of a user", () => {
  it("shows a setting set on the user", () => {
    const data = emptyData();
    data.elements.push(elementRow({ user: "alice" }, 0, { setting: "max_threads", value: "4" }));

    const setting = settingOf(resolveEffectiveSettings({ target: alice, data }), "max_threads");
    expect(setting.value).toBe("4");
    expect(setting.valueSource.kind).toBe("user");
  });

  it("takes value and constraint from a profile of the user", () => {
    const data = emptyData();
    data.profiles.push(profile("analysts"));
    data.elements.push(
      elementRow({ user: "alice" }, 0, { inherit: "analysts" }),
      elementRow({ profile: "analysts" }, 0, { setting: "max_memory_usage", value: "1000", max: "2000" }),
    );

    const setting = settingOf(resolveEffectiveSettings({ target: alice, data }), "max_memory_usage");
    expect(setting).toMatchObject({ value: "1000", max: "2000", writability: "WRITABLE" });
    expect(describeSource(setting.valueSource)).toBe('profile "analysts", via user "alice"');
  });

  it("follows inheritance three levels deep, and the nearest profile wins", () => {
    const data = emptyData();
    data.profiles.push(profile("base"), profile("middle"), profile("top"));
    data.elements.push(
      elementRow({ user: "alice" }, 0, { inherit: "top" }),
      elementRow({ profile: "top" }, 0, { inherit: "middle" }),
      elementRow({ profile: "top" }, 1, { setting: "max_threads", value: "8" }),
      elementRow({ profile: "middle" }, 0, { inherit: "base" }),
      elementRow({ profile: "middle" }, 1, { setting: "max_threads", value: "4" }),
      elementRow({ profile: "base" }, 0, { setting: "max_threads", value: "2" }),
      elementRow({ profile: "base" }, 1, { setting: "readonly", value: "1" }),
    );

    const result = resolveEffectiveSettings({ target: alice, data });
    expect(settingOf(result, "max_threads").value).toBe("8");
    expect(settingOf(result, "max_threads").overriddenValues.map((item) => item.value)).toEqual(["2", "4"]);
    expect(settingOf(result, "readonly").value).toBe("1");
  });

  it("counts a profile reached twice only at its last place", () => {
    const elements = [
      { inheritProfile: "shared", source: { kind: "role", name: "first", path: ["first"] } },
      { settingName: "max_threads", value: "16", min: null, max: null, writability: null, source: { kind: "role", name: "first", path: ["first"] } },
      { inheritProfile: "shared", source: { kind: "user", name: "alice" } },
    ];
    const rows = [elementRow({ profile: "shared" }, 0, { setting: "max_threads", value: "2" })];

    const { elements: substituted } = substituteProfiles(elements, rows, new Set(["shared"]));
    const settings = foldElements(substituted);
    expect(settings[0].value).toBe("2");
    expect(settings[0].overriddenValues.map((item) => item.value)).toEqual(["16"]);
  });

  it("stops at a cycle between two profiles", () => {
    const data = emptyData();
    data.profiles.push(profile("one"), profile("two"));
    data.elements.push(
      elementRow({ user: "alice" }, 0, { inherit: "one" }),
      elementRow({ profile: "one" }, 0, { inherit: "two" }),
      elementRow({ profile: "one" }, 1, { setting: "max_threads", value: "1" }),
      elementRow({ profile: "two" }, 0, { inherit: "one" }),
      elementRow({ profile: "two" }, 1, { setting: "max_threads", value: "2" }),
    );

    const result = resolveEffectiveSettings({ target: alice, data });
    expect(settingOf(result, "max_threads").value).toBe("1");
  });

  it("lets the user override a role", () => {
    const data = emptyData();
    data.roles.push({ name: "reporting", id: "1" });
    data.roleGrants.push(roleGrant({ user: "alice" }, "reporting"));
    data.elements.push(
      elementRow({ role: "reporting" }, 0, { setting: "max_threads", value: "2" }),
      elementRow({ user: "alice" }, 0, { setting: "max_threads", value: "6" }),
    );

    const setting = settingOf(resolveEffectiveSettings({ target: alice, data }), "max_threads");
    expect(setting.value).toBe("6");
    expect(describeSource(setting.overriddenValues[0].source)).toBe('role "reporting"');
  });

  it("merges a granted role after the role it is granted to", () => {
    const data = emptyData();
    data.roles.push({ name: "reporting", id: "1" }, { name: "readers", id: "2" });
    data.roleGrants.push(roleGrant({ user: "alice" }, "reporting"), roleGrant({ role: "reporting" }, "readers"));
    data.elements.push(
      elementRow({ role: "reporting" }, 0, { setting: "max_threads", value: "2" }),
      elementRow({ role: "readers" }, 0, { setting: "max_threads", value: "3" }),
    );

    const result = resolveEffectiveSettings({ target: alice, data });
    const setting = settingOf(result, "max_threads");
    expect(setting.value).toBe("3");
    expect(describeSource(setting.valueSource)).toBe('role "reporting > readers"');
    expect(setting.orderMayDiffer).toBe(false);
  });

  it("uses a non-default role only with all granted roles", () => {
    const data = emptyData();
    data.roles.push({ name: "admin_tools", id: "1" });
    data.roleGrants.push(roleGrant({ user: "alice" }, "admin_tools", { isDefault: false }));
    data.elements.push(elementRow({ role: "admin_tools" }, 0, { setting: "max_threads", value: "32" }));

    expect(settingOf(resolveEffectiveSettings({ target: alice, data, useAllGrantedRoles: true }), "max_threads").value).toBe("32");
    expect(settingOf(resolveEffectiveSettings({ target: alice, data, useAllGrantedRoles: false }), "max_threads")).toBeUndefined();
  });

  it("matches the TO clause of a profile", () => {
    expect(profileAppliesTo(profile("p", { list: ["alice"] }), ["alice"])).toBe(true);
    expect(profileAppliesTo(profile("p", { all: true }), ["alice"])).toBe(true);
    expect(profileAppliesTo(profile("p", { all: true, except: ["alice"] }), ["alice"])).toBe(false);
    expect(profileAppliesTo(profile("p", { list: ["reporting"] }), ["alice", "reporting"])).toBe(true);
    expect(profileAppliesTo(profile("p", { all: true, except: ["reporting"] }), ["alice", "reporting"])).toBe(false);
    expect(profileAppliesTo(profile("p", { list: ["bob"] }), ["alice"])).toBe(false);
  });

  it("puts the default profile first, so every other source overrides it", () => {
    const data = emptyData();
    data.profiles.push(profile("night", { list: ["alice"] }));
    data.elements.push(
      elementRow({ profile: "default" }, 0, { setting: "max_threads", value: "1" }),
      elementRow({ profile: "night" }, 0, { setting: "max_threads", value: "2" }),
    );

    const setting = settingOf(resolveEffectiveSettings({ target: alice, data }), "max_threads");
    expect(setting.value).toBe("2");
    expect(describeSource(setting.valueSource)).toBe('profile "night" (TO clause)');
    expect(describeSource(setting.overriddenValues[0].source)).toBe('default profile "default"');
  });

  it("flags two TO profiles that set the same setting", () => {
    const data = emptyData();
    data.profiles.push(profile("first", { list: ["alice"] }), profile("second", { list: ["alice"] }));
    data.elements.push(
      elementRow({ profile: "first" }, 0, { setting: "max_threads", value: "2" }),
      elementRow({ profile: "second" }, 0, { setting: "max_threads", value: "3" }),
    );

    expect(settingOf(resolveEffectiveSettings({ target: alice, data }), "max_threads").orderMayDiffer).toBe(true);
  });
});

describe("constraints", () => {
  const elements = [
    { settingName: "max_threads", value: null, min: "1", max: "8", writability: null, source: { kind: "user", name: "a" } },
    { settingName: "max_threads", value: null, min: null, max: "4", writability: "CONST", source: { kind: "user", name: "a" } },
  ];

  it("replaces the whole constraint when settings_constraints_replace_previous is on", () => {
    expect(foldElements(elements, { replacePrevious: true })[0]).toMatchObject({ min: null, max: "4", writability: "CONST" });
  });

  it("keeps the earlier min when the option is off", () => {
    expect(foldElements(elements, { replacePrevious: false })[0]).toMatchObject({ min: "1", max: "4", writability: "CONST" });
  });
});

describe("special cases", () => {
  it("skips allow_backup and treats an alias as its setting", () => {
    const data = emptyData();
    data.settings.push({ name: "old_name", alias_for: "new_name" });
    data.elements.push(
      elementRow({ user: "alice" }, 0, { setting: "allow_backup", value: "0" }),
      elementRow({ user: "alice" }, 1, { setting: "new_name", value: "1" }),
      elementRow({ user: "alice" }, 2, { setting: "old_name", value: "2" }),
    );

    const result = resolveEffectiveSettings({ target: alice, data });
    expect(result.settings.map((setting) => setting.name)).toEqual(["new_name"]);
    expect(settingOf(result, "new_name").value).toBe("2");
  });

  it("reports a profile that does not exist", () => {
    const data = emptyData();
    data.elements.push(elementRow({ user: "alice" }, 0, { inherit: "gone" }));

    expect(resolveEffectiveSettings({ target: alice, data }).missingProfiles).toEqual(["gone"]);
  });

  it("works out the settings of a role", () => {
    const data = emptyData();
    data.roles.push({ name: "reporting", id: "1" });
    data.profiles.push(profile("for_reporting", { list: ["reporting"] }));
    data.elements.push(
      elementRow({ profile: "for_reporting" }, 0, { setting: "max_threads", value: "2" }),
      elementRow({ role: "reporting" }, 0, { setting: "max_threads", value: "3" }),
    );

    const result = resolveEffectiveSettings({ target: { type: "role", name: "reporting" }, data });
    expect(settingOf(result, "max_threads").value).toBe("3");
    expect(result.profilesWithTo).toEqual(["for_reporting"]);
  });
});
