// ClusterSwitcher - Brand row and cluster picker at the top of the sidebar
//
// Style guide (Cluster Overview screen): the sidebar opens with the CH mark,
// the product name and version, then a full-width cluster picker with a
// connection dot. Switching cluster reconnects to the first node of the new
// cluster, exactly as the old navbar picker did.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import Select from "../common/Select.jsx";
import { StatusDot } from "../ui/index.jsx";
import { useConnection } from "../../App.jsx";
import { editorDisconnect } from "../../utils/api.js";

import chopsLightLogo from "../../assets/chops-light.svg";
import chopsDarkLogo from "../../assets/chops-dark.svg";
import CollapseLogoLight from "../../assets/CollapseLogoLight.svg";
import CollapseLogoDark from "../../assets/CollapseLogoDark.png"

const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";

export function SidebarBrand({ collapsed = false,theme }) {
  return (
    <a
      href="https://www.ch-ops.io/"
      target="_blank"
      rel="noopener noreferrer"
      className="sidebar-brand"
      title="CHOps"
    >

      {collapsed ? <img
          style={{ width: "20px"}}
          src={theme === "dark" ? CollapseLogoLight :CollapseLogoDark}
        /> :(
        
        <span className="sidebar-brand-text">
          <img
          style={{ width: "70px",marginBottom:"2px"}}
          src={theme === "dark" ? chopsLightLogo : chopsDarkLogo}
        />
          {APP_VERSION && <span className="sidebar-brand-version">v{APP_VERSION}</span>}
        </span>
      )}
    </a>
  );
}

export default function ClusterSwitcher({ collapsed = false, onRefresh }) {
  const { clusters = [], selectedClusterId, nodes = [], connected, testConnection, switchCluster } =
    useConnection();

  async function handleChangeCluster(e) {
    switchCluster(e.target.value);
    if (nodes?.length > 0) {
      const firstNode = nodes[0];
      await testConnection(firstNode?.host, firstNode?.user, firstNode?.port);
      onRefresh?.();
    }
    await editorDisconnect();
  }

  if (!clusters.length) return null;

  if (collapsed) {
    const current = clusters.find((c) => c.id === selectedClusterId);
    return (
      <div className="cluster-switcher collapsed" title={current?.name || "Cluster"}>
        <StatusDot tone={connected ? "success" : "danger"} />
      </div>
    );
  }

  return (
    <div className="cluster-switcher">
      <StatusDot tone={connected ? "success" : "danger"} className="cluster-switcher-dot" />
      <Select
        className="form-select conn-select cluster-switcher-select"
        value={selectedClusterId}
        onChange={handleChangeCluster}
        title="Switch cluster"
        aria-label="Cluster"
      >
        {clusters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
