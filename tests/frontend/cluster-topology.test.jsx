import { describe, expect, it } from "vitest";

import {
  formatHealth,
  groupByCluster,
  nodeIsUnhealthy,
  readHealth,
} from "../../src/frontend/components/overview/ClusterTopology.jsx";

describe("ClusterTopology", () => {
  it("keeps zero and null distinct and flags unhealthy nodes", () => {
    expect(readHealth({ errors_count: 0 }, "errors_count")).toBe(0);
    expect(readHealth({}, "errors_count")).toBeNull();
    expect(formatHealth(null, "count")).toBe("-");
    expect(formatHealth(0, "count")).toBe("0");
    expect(nodeIsUnhealthy({ errors_count: 2 })).toBe(true);
    expect(nodeIsUnhealthy({ errors_count: 0, slowdowns_count: 0 })).toBe(false);
  });

  it("groups nodes by cluster with a stable alphabetical order", () => {
    const grouped = groupByCluster([
      { cluster: "beta", shard_num: 2, replica_num: 1 },
      { cluster: "alpha", shard_num: 1, replica_num: 2 },
      { cluster: "alpha", shard_num: 1, replica_num: 1 },
    ]);

    expect(grouped.map((group) => group.name)).toEqual(["alpha", "beta"]);
    expect(grouped[0].nodes).toHaveLength(2);
    expect(grouped[1].nodes[0].cluster).toBe("beta");
  });
});
