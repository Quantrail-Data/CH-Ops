// Copyright (C) 2026 Quantrail™ Data Private Limited
// Overview entry point that picks a cluster and renders the Kubernetes screens.
// Contributors -> Kathir Moorthy

import React, { useEffect, useState } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import { apiFetch } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import { useConnection } from "../../App.jsx";
import KubernetesInsight from "./KubernetesInsight.jsx";

export default function KubernetesInsightPage() {
  const toast = useToast();
  const { selectedClusterId } = useConnection() || {};
  const [clusters, setClusters] = useState([]);
  const [chosen, setChosen] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/api/cluster")
      .then((r) => setClusters((Array.isArray(r) ? r : []).filter((c) => c.kind === "k8s")))
      .catch((e) => toast.error("Failed to load clusters: " + e.message))
      .finally(() => setLoaded(true));
  }, []);

  // Follow the cluster picked in the navbar when it is one of ours
  useEffect(() => {
    if (!clusters.length) return;
    const match = clusters.find((c) => c.id === selectedClusterId);
    setChosen(match ? match.id : clusters[0].id);
  }, [clusters, selectedClusterId]);

  const cluster = clusters.find((c) => c.id === chosen);

  if (!loaded) {
    return (
      <div className="page-content">
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  if (!clusters.length) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-topology-star-3"></Icon> Kubernetes Insights
          </h2>
        </div>
        <div className="empty-state">
          <Icon className="ti ti-topology-star-3"></Icon>
          <p>
            No Kubernetes clusters yet. Add one under Cluster Management, on the
            Kubernetes tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-topology-star-3"></Icon> Kubernetes Insights
        </h2>
        {clusters.length > 1 && (
          <div style={{ marginLeft: "auto", minWidth: 220 }}>
            <Select
              className="form-select"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {cluster && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          {cluster.k8s?.installation} in namespace {cluster.k8s?.namespace}, via{" "}
          {cluster.k8s?.operator === "ocko" ? "OCKO" : "AKOC"}
        </div>
      )}

      {cluster && <KubernetesInsight cluster={cluster} />}
    </div>
  );
}
