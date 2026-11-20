// tree-graph-data.test.js - The data behind TreeGraph: layout helpers and the
// tree builders for grants, indexes, projections and settings.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { describe, it, expect } from "vitest";
import {
  findStartClosedIds,
  flattenTree,
  findPathToRoot,
  estimateNodeWidth,
  layoutTree,
} from "../../src/frontend/utils/treeGraphLayout.js";
import { buildUserGrantTree, buildRoleGrantTree, grantName } from "../../src/frontend/utils/grantTrees.js";
import { buildIndexTree, buildProjectionTree } from "../../src/frontend/utils/schemaTrees.js";
import { buildSettingsSourceTree } from "../../src/frontend/utils/settingsTree.js";

const SMALL_TREE = {
  name: "root",
  children: [
    { name: "a", children: [{ name: "a1" }, { name: "a2" }] },
    { name: "b" },
  ],
};

describe("treeGraphLayout", () => {
  it("gives each node a stable id from its path and an edge to its parent", () => {
    const { nodes, edges } = flattenTree(SMALL_TREE);
    expect(nodes.map((node) => node.id)).toEqual(["root", "root/0", "root/0/0", "root/0/1", "root/1"]);
    expect(edges).toContainEqual({ id: "root/0->root/0/1", source: "root/0", target: "root/0/1" });
    expect(nodes.find((node) => node.id === "root/0").childCount).toBe(2);
  });

  it("leaves out the children of a closed node", () => {
    const { nodes } = flattenTree(SMALL_TREE, new Set(["root/0"]));
    expect(nodes.map((node) => node.id)).toEqual(["root", "root/0", "root/1"]);
    expect(nodes.find((node) => node.id === "root/0").isClosed).toBe(true);
  });

  it("closes deep nodes and nodes with many children at the start", () => {
    expect(findStartClosedIds(SMALL_TREE, 1)).toEqual(new Set(["root/0"]));
    const wide = { name: "root", children: Array.from({ length: 30 }, (_, i) => ({ name: `c${i}` })) };
    expect(findStartClosedIds(wide)).toEqual(new Set(["root"]));
  });

  it("finds the path from a node to the root", () => {
    const { nodes } = flattenTree(SMALL_TREE);
    const path = findPathToRoot("root/0/1", nodes);
    expect([...path.nodeIds]).toEqual(["root/0/1", "root/0", "root"]);
    expect([...path.edgeIds]).toEqual(["root/0->root/0/1", "root->root/0"]);
  });

  it("sizes nodes within limits and places children right of the parent", () => {
    expect(estimateNodeWidth({ name: "x", kind: "" })).toBe(120);
    expect(estimateNodeWidth({ name: "x".repeat(200), kind: "grant" })).toBe(320);
    const { nodes, edges } = flattenTree(SMALL_TREE);
    const placed = layoutTree(nodes, edges);
    const root = placed.find((node) => node.id === "root");
    const child = placed.find((node) => node.id === "root/0");
    expect(child.x).toBeGreaterThan(root.x + root.width);
  });
});

describe("grantTrees", () => {
  const roleGrants = [
    { user_name: "analyst", role_name: "", granted_role_name: "reporting" },
    { user_name: "", role_name: "reporting", granted_role_name: "reader" },
    { user_name: "", role_name: "reader", granted_role_name: "reporting" },
  ];
  const grants = [
    { user_name: "", role_name: "reader", access_type: "SELECT", database: "sales", table: "", column: "", is_partial_revoke: 0 },
    { user_name: "", role_name: "reader", access_type: "SELECT", database: "sales", table: "t", column: "email", is_partial_revoke: 1 },
    { user_name: "analyst", role_name: "", access_type: "SHOW TABLES", database: "", table: "", column: "", is_partial_revoke: "0" },
  ];

  it("joins the grant parts without the empty ones", () => {
    expect(grantName(grants[1])).toBe("SELECT.sales.t.email");
  });

  it("builds user -> roles and direct grants, and marks a partial revoke", () => {
    const tree = buildUserGrantTree("analyst", roleGrants, grants);
    expect(tree).toMatchObject({ name: "analyst", kind: "user" });
    expect(tree.children.map((child) => child.name)).toEqual(["Roles", "Direct grants"]);
    const reporting = tree.children[0].children[0];
    const reader = reporting.children[0];
    expect(reader).toMatchObject({ name: "reader", kind: "role" });
    const readerGrants = reader.children.find((child) => child.name === "Grants").children;
    expect(readerGrants.map((grant) => grant.kind)).toEqual(["grant", "revoke"]);
  });

  it("marks a circular role once and does not loop", () => {
    const tree = buildRoleGrantTree("reporting", roleGrants, grants);
    const reader = tree.children[0];
    expect(reader.children[0]).toEqual({ name: "reporting", kind: "circular", tone: "danger" });
  });
});

describe("schemaTrees", () => {
  it("builds database -> tables -> indexes -> expression", () => {
    const rows = [
      { table: "events", name: "idx_user", type_full: "bloom_filter", granularity: 4, expr: "user_id" },
      { table: "events", name: "idx_time", type_full: "minmax", granularity: 1, expr: "ts" },
      { table: "logs", name: "idx_msg", type_full: "tokenbf_v1", granularity: 2, expr: "message" },
    ];
    const tree = buildIndexTree("app", rows);
    expect(tree.children.map((table) => table.name)).toEqual(["events", "logs"]);
    expect(tree.children[0].children[0]).toMatchObject({ name: "idx_user (bloom_filter, granularity 4)", kind: "index" });
    expect(tree.children[0].children[0].children[0]).toMatchObject({ name: "user_id", kind: "expr" });
    expect(buildIndexTree("app", [])).toBeNull();
  });

  it("builds projections with the sorting key and a short query", () => {
    const longQuery = "SELECT " + "x, ".repeat(40);
    const tree = buildProjectionTree("app", [{ table: "t", name: "p1", type: "Normal", sorting_key: "", query: longQuery }]);
    const details = tree.children[0].children[0].children;
    expect(details[0]).toMatchObject({ name: "none", kind: "key" });
    expect(details[1].name.endsWith("...")).toBe(true);
    expect(details[1].name.length).toBe(83);
  });
});

describe("settingsTree", () => {
  it("puts each setting under the source of its final value, in the ClickHouse order", () => {
    const result = {
      profilesWithTo: ["analysts"],
      enabledRoles: [{ name: "reporting", path: ["reporting"] }],
      settings: [
        { name: "max_threads", value: "8", writability: null, orderMayDiffer: false, valueSource: { kind: "role", name: "reporting", path: ["reporting"] } },
        { name: "readonly", value: "1", writability: "CONST", orderMayDiffer: false, valueSource: { kind: "profile", name: "analysts", via: { kind: "to", name: "analysts" } } },
        { name: "max_memory_usage", value: null, writability: "CONST", orderMayDiffer: false, valueSource: null },
      ],
    };
    const tree = buildSettingsSourceTree({ targetType: "user", targetName: "bob", result, defaultProfileName: "default" });
    expect(tree).toMatchObject({ name: "bob", kind: "user" });
    expect(tree.children.map((source) => source.kind)).toEqual(["profile (TO)", "role"]);
    expect(tree.children[0].children[0]).toMatchObject({ name: "readonly = 1", kind: "const" });
    expect(tree.children[1].children[0]).toMatchObject({ name: "max_threads = 8", kind: "setting" });
  });
});
