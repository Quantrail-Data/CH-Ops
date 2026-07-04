// AlertMarquee - Live alert ticker that scrolls active firing alerts
//
// Polls the backend every 30 seconds for actively firing alert rules and
// displays them as a scrolling marquee bar at the top of the page. Each alert
// shows its severity (critical, warning, info), name, current value, threshold,
// cluster, and affected nodes. Users can collapse it to a small banner.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited

import React, { useState, useEffect } from "react";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import { useConnection } from "../../App.jsx";
import {motion} from "motion/react";

const OP = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=", neq: "!=" };

export default function AlertMarquee() {
  const [alerts, setAlerts] = useState([]);
  const [visible, setVisible] = useState(true);
  const { clusterName } = useConnection();


  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const d = await apiFetch("/api/alerts/rules/active");
        if (mounted && Array.isArray(d)) {
          setAlerts(d);
        }
      } catch {}
    }
    poll();
    const timer = setInterval(poll, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (!alerts.length) return null;

  const text = alerts.map((a) => {
    const op = OP[a?.operator] || a?.operator;
    const ts = a?.lastRunAt ? new Date(a.lastRunAt).toLocaleTimeString() : "";
    const nodes =
      Array.isArray(a?.nodes) && a?.nodes?.length > 0
        ? a?.nodes.join(", ")
        : "all nodes";
    const cluster = clusterName || "Default";
    return {
      message: `${(a?.severity || "info").toUpperCase()}: ${a?.name} - value ${a?.lastValue ?? "?"} ${op} threshold ${a?.threshold} [${cluster} / ${nodes}]${ts ? ` (${ts})` : ""}`,
      type: a?.severity || "info",
    };
  });

  if (!visible) {
    return (
      <div
        onClick={() => setVisible(true)}
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          borderBottom: "1px solid rgba(248,113,113,0.2)",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--color-danger)",
          flexShrink: 0,
        }}
      >
        <Icon className="ti ti-alert-triangle" style={{ fontSize: 16 }}></Icon>
        {alerts.length} active alert(s) - click to expand
      </div>
    );
  }

  const colorSetter = (type) => {
    if (type === "warning") {
      return "var(--color-warning)";
    } else if (type === "info") {
      return "var(--color-info)";
    }
    return "var(--color-danger)";
  };

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        height: 34,
        flexShrink: 0,
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderBottom: `1px solid  var(--accent-soft)`,
        display: "flex",
        alignItems: "center",
      }}
      duration={40000}
    >
      <marquee
        style={{
          display: "inline-flex",

          alignItems: "center",
          whiteSpace: "nowrap",
          paddingRight: "30px",
          fontSize: "11px",
          fontWeight: 600,
          willChange: "transform",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          {text?.map((msg, indx) => {
            const c = colorSetter(msg?.type);
            return (
              <div
                style={{
                  margin: "0px 10px",
                  display: "flex",
                  alignItems: "center",
                  color: c,
                }}
                key={indx}
              >
                <Icon
                  className="ti ti-alert-triangle"
                  style={{ fontSize: 16, marginRight: 8, color: c }}
                />
                {msg?.message}
              </div>
            );
          })}
        </div>
      </marquee>
     <motion.button
        onClick={() => setVisible(false)}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--border-default)",
          borderRadius: 4,
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: "2px 6px",
          fontSize: 14,
          lineHeight: 1,
        }}
        
        className="btn btn-danger"
      >
        <Icon className="ti ti-x" style={{ fontSize: 14 }}></Icon>
      </motion.button>
    </div>
  );
}
