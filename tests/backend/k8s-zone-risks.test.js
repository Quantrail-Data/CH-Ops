// k8s-zone-risks.test.js - Shards with two or more replicas in one zone.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { buildZoneRisks } from "../../src/backend/services/k8s/zoneRisks.js";

function host(cluster, shard, node) {
  return { cluster, shard, node };
}

describe("buildZoneRisks", () => {
  it("finds two replicas of one shard in one zone", () => {
    const zoneByNode = new Map([
      ["node-1", "eu-west-1a"],
      ["node-2", "eu-west-1a"],
      ["node-3", "eu-west-1b"],
    ]);
    const hosts = [
      host("main", 0, "node-1"),
      host("main", 0, "node-2"),
      host("main", 1, "node-3"),
    ];
    expect(buildZoneRisks(hosts, zoneByNode)).toEqual([
      { cluster: "main", shard: 0, zone: "eu-west-1a", replicas: 2 },
    ]);
  });

  it("finds no risk when the replicas are in different zones", () => {
    const zoneByNode = new Map([
      ["node-1", "zone-a"],
      ["node-2", "zone-b"],
    ]);
    const hosts = [host("main", 0, "node-1"), host("main", 0, "node-2")];
    expect(buildZoneRisks(hosts, zoneByNode)).toEqual([]);
  });

  it("skips hosts without a node or without a zone", () => {
    const zoneByNode = new Map([["node-1", "zone-a"]]);
    const hosts = [host("main", 0, null), host("main", 0, "node-without-zone")];
    expect(buildZoneRisks(hosts, zoneByNode)).toEqual([]);
  });

  it("returns null when there is no zone map", () => {
    expect(buildZoneRisks([host("main", 0, "node-1")], null)).toBe(null);
  });
});
