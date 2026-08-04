// Contributors -> Praveen kumar, Kathir Moorthy
// Shared ON CLUSTER guidance and session affinity warning for the RBAC screens.
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useEffect, useState } from "react";
import { useConnection } from "../../App.jsx";
import { apiFetch } from "../../utils/api.js";

// Read the RBAC context for the currently selected cluster.
export function useRbacContext() {
  const { selectedClusterId } = useConnection() || {};
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedClusterId) {
      setCtx(null);
      return undefined;
    }

    apiFetch(`/api/k8s/insight/${selectedClusterId}/rbac-context`)
      .then((r) => {
        if (!cancelled) setCtx(r);
      })
      .catch(() => {
        // A direct-connection cluster has no context, and a failure here must never block the RBAC screens.
        if (!cancelled) setCtx(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedClusterId]);

  return ctx;
}

// The banner itself.
export default function OnClusterBanner({ rbac, value }) {
  if (!rbac?.warnAboutOnCluster) return null;
  if (value) return null;

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 12,
        borderRadius: "var(--radius-md)",
        background: "var(--color-warning-bg)",
        fontSize: 13,
      }}
    >
      This cluster has {rbac.replicaCount} replicas. Without ON CLUSTER, this
      change applies to one replica only.
    </div>
  );
}

// Warning for the SQL surfaces, where losing session affinity actually breaks things
export function SessionAffinityWarning({ rbac }) {
  if (!rbac?.sessionAffinity?.checked) return null;
  if (rbac.sessionAffinity.sticky) return null;

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 12,
        borderRadius: "var(--radius-md)",
        background: "var(--color-info-bg)",
        fontSize: 13,
      }}
    >
      Queries from here can land on different replicas. Temporary tables and
      multi-statement sequences that rely on staying on one server will not work
      reliably. Ask your platform team to enable session affinity on the load
      balancer.
    </div>
  );
}
