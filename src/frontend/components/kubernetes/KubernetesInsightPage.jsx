// Copyright (C) 2026 Quantrail™ Data Private Limited
// Overview entry point that picks a cluster and renders the Kubernetes screens.
// Contributors -> Kathir Moorthy

import { useEffect, useState } from "react";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import { useConnection } from "../../App.jsx";
import KubernetesInsight from "./KubernetesInsight.jsx";
import useEmptyContainerHeight from "../../hooks/useEmptyContainerHeight.js";


export default function KubernetesInsightPage({mainRef}) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is a new object on each render. Adding it would repeat the message.
  }, []);

  // Follow the cluster picked in the navbar when it is one of ours
  useEffect(() => {
    if (!clusters.length) return;
    const match = clusters.find((c) => c.id === selectedClusterId);
    setChosen(match ? match.id : clusters[0].id);
  }, [clusters, selectedClusterId]);

  const cluster = clusters.find((c) => c.id === chosen);

    // calculate the Height of application main container app-main
  const {memoHeightAppMain} = useEmptyContainerHeight(900,mainRef)


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
        <div className="empty-state" style={{ padding: 40,height:`${memoHeightAppMain}px`}}>
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