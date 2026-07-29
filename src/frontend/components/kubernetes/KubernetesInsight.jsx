// Eight read-only screens for a Kubernetes-managed ClickHouse® cluster.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors -> Kathir Moorthy, Kathirdhasan

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import yaml from "js-yaml";
import { apiFetch, apiFetchText } from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import {
  splitLines,
  filterLines,
  sinceSecondsFrom,
  clampLines,
  readLineCount,
  writeLineCount,
  readSince,
  writeSince,
  LOG_LINES_MIN,
  LOG_LINES_MAX,
  LOG_LINES_STEP,
} from "../../utils/podLogs.js";

const TABS = [
  { id: "health", label: "Health" },
  { id: "topology", label: "Topology" },
  { id: "reconcile", label: "Reconcile" },
  { id: "storage", label: "Storage" },
  { id: "network", label: "Network" },
  { id: "config", label: "Configuration" },
  { id: "events", label: "Events" },
  { id: "logs", label: "Logs" },
];

const muted = { color: "var(--text-muted)" };

function Panel({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {title && <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>{title}</h3>}
      {subtitle && (
        <div style={{ ...muted, fontSize: 13, marginBottom: 12 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

function Banner({ tone = "info", children }) {
  const background = {
    info: "var(--color-info-bg)",
    warn: "var(--color-warning-bg)",
    bad: "var(--color-danger-bg)",
  }[tone];

  return (
    <div
      style={{
        padding: 12,
        borderRadius: "var(--radius-md)",
        background,
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

// Health

function HealthTab({ data }) {
  if (!data) return null;
  const failing = data.checks.filter((c) => c.ok === false);

  return (
    <div>
      <Panel
        title={
          data.unknown
            ? `${data.passing} of ${data.total} checks passing, ${data.unknown} could not run`
            : `${data.passing} of ${data.total} checks passing`
        }
        subtitle="Each of these is small on its own. Together they are the reason to open this screen daily rather than during an incident."
      >
        <table className="data-table" style={{ width: "100%" }}>
          <tbody>
            {data.checks.map((c) => (
              <tr key={c.name}>
                <td style={{ width: 24 }}>
                  <Icon
                    className={
                      c.ok === true
                        ? "ti ti-check"
                        : c.ok === null
                          ? "ti ti-help-circle"
                          : "ti ti-alert-triangle"
                    }
                  />
                </td>
                <td style={{ fontWeight: c.ok === false ? 600 : "normal" }}>{c.name}</td>
                <td style={{ ...muted, fontSize: 13 }}>{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {failing.length > 0 && (
        <Banner tone="warn">
          {failing.length} check{failing.length > 1 ? "s" : ""} need attention. None
          of these stops the cluster serving queries right now; they are the things
          that turn into an incident later.
        </Banner>
      )}

      {data.unavailable?.length > 0 && (
        <Panel title="Not available on this deployment">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, ...muted }}>
            {data.unavailable.map((u) => (
              <li key={u.table}>{u.message}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// Topology

function HostCell({ host, signalsUnreliable }) {
  const bad = !host.operatorReady || host.inRotation?.ready === false;
  const draining = host.inRotation?.terminating;

  return (
    <div
      style={{
        padding: 8,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-default)",
        background: bad ? "var(--color-danger-bg)" : "transparent",
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>replica {host.replica}</div>
      <div style={{ ...muted, fontSize: 12 }}>{host.podName}</div>

      <div style={{ fontSize: 12, marginTop: 6 }}>
        {signalsUnreliable ? (
          <span title="Troubleshoot mode is on, so probes are disabled">
            readiness unknown
          </span>
        ) : (
          <span>{host.operatorReady ? "ready" : "not ready"}</span>
        )}
      </div>

      <div style={{ fontSize: 12 }}>
        {host.inRotation === null
          ? "not behind a service"
          : draining
            ? "draining, still serving"
            : host.inRotation.ready
              ? "in rotation"
              : "out of rotation"}
      </div>

      {host.restartCount > 0 && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {host.restartCount} restarts
          {host.lastTerminationReason ? ` (${host.lastTerminationReason})` : ""}
        </div>
      )}
    </div>
  );
}

function TopologyTab({ data }) {
  if (!data) return null;

  return (
    <div>
      {data.healthSignalsUnreliable && (
        <Banner tone="warn">
          <strong>Troubleshoot mode is on.</strong> The operator has disabled
          liveness and readiness probes for this installation, so a pod can report
          Ready while ClickHouse® is not serving. Treat every health indicator on
          this page as unverified until the flag is removed.
        </Banner>
      )}

      {data.versionSkew && (
        <Banner tone="warn">
          <strong>Hosts are running different versions.</strong>{" "}
          {data.versionSkew.join(", ")}. This is what a rolling update looks like
          when it stopped part way; the operator does not roll back the hosts it
          already finished.
        </Banner>
      )}

      {data.placementRisks?.length > 0 && (
        <Banner tone="warn">
          <strong>Replicas sharing a node.</strong>{" "}
          {data.placementRisks
            .map((r) => `shard ${r.shard} has ${r.replicas} replicas on ${r.node}`)
            .join("; ")}
          . Losing that node loses more than one copy.
        </Banner>
      )}

      {data.drainProtection && !data.drainProtection.protected && (
        <Banner tone="warn">
          <strong>No pod disruption budget.</strong> Nothing stops a node drain
          evicting several replicas at once during routine maintenance.
        </Banner>
      )}

      {data.drainProtection?.blocked && (
        <Banner tone="info">
          A pod disruption budget currently allows no disruptions, so anybody
          trying to drain a node is blocked.
        </Banner>
      )}

      {Object.entries(data.grid || {}).map(([clusterName, shards]) => (
        <Panel key={clusterName} title={clusterName}>
          {Object.entries(shards).map(([shard, replicas]) => (
            <div key={shard} style={{ marginBottom: 12 }}>
              <div style={{ ...muted, fontSize: 12, marginBottom: 4 }}>
                shard {shard}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {replicas.map((h) => (
                  <HostCell
                    key={h.id}
                    host={h}
                    signalsUnreliable={data.healthSignalsUnreliable}
                  />
                ))}
              </div>
            </div>
          ))}
        </Panel>
      ))}

      {data.keeper && (
        <Panel
          title="Keeper"
          subtitle={
            data.keeper.namespaceUncertain
              ? "The namespace could not be determined from the configured host, so Keeper details are unavailable."
              : `namespace ${data.keeper.namespace}`
          }
        >
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {data.keeper.hosts.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// Reconcile

function ReconcileTab({ data }) {
  if (!data) return null;

  const everyHost = [
    ...new Set([...(data.tablesCreated || []), ...(data.replicasCaughtUp || [])]),
  ];

  return (
    <div>
      {data.unmanaged && (
        <Banner tone="warn">
          <strong>This installation is not being reconciled.</strong> It exists,
          and nothing is acting on it. The usual cause is an operator configured
          to watch other namespaces.
        </Banner>
      )}

      {data.suspended && (
        <Banner tone="info">
          Reconciliation is paused for this installation. The status may read
          Aborted; that reflects the pause, not a failure.
        </Banner>
      )}

      {data.stopped && (
        <Banner tone="info">
          This installation is stopped. Pods and services are removed and the
          volumes are kept, so setting it back will bring it up with its data
          intact.
        </Banner>
      )}

      {!data.operator?.reachable && (
        <Banner tone="bad">
          <strong>The operator is not reachable.</strong> The cluster will keep
          serving queries, and nothing you change will be applied.
        </Banner>
      )}

      <Panel title="Current state">
        <table className="data-table" style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td>Status</td>
              <td>{data.status ?? "unknown"}</td>
            </tr>
            <tr>
              <td>Task</td>
              <td>{data.taskID ?? "-"}</td>
            </tr>
            <tr>
              <td>Hosts</td>
              <td>
                {data.hosts.completed ?? 0} of {data.hosts.total ?? 0} completed
                {data.hosts.failed ? `, ${data.hosts.failed} failed` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      {everyHost.length > 0 && (
        <Panel
          title="Replica readiness"
          subtitle="After a scale-out this is the question people answer by hand, polling system.replicas until it settles."
        >
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Host</th>
                <th>Tables created</th>
                <th>Caught up</th>
              </tr>
            </thead>
            <tbody>
              {everyHost.map((h) => (
                <tr key={h}>
                  <td>{h}</td>
                  <td>{data.tablesCreated?.includes(h) ? "yes" : "no"}</td>
                  <td>{data.replicasCaughtUp?.includes(h) ? "yes" : "not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {data.errors?.length > 0 && (
        <Panel title="Errors reported by the operator">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {data.errors.map((e, i) => (
              <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// Storage

function StorageTab({ data }) {
  if (!data) return null;

  const high = data.warnings.filter((w) => w.severity === "high");
  const info = data.warnings.filter((w) => w.severity !== "high");

  return (
    <div>
      {high.map((w, i) => (
        <Banner key={i} tone="bad">
          <strong>{w.volume}:</strong> {w.message}
        </Banner>
      ))}

      <Panel title="Volumes">
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Volume</th>
              <th>Shard/Replica</th>
              <th>Requested</th>
              <th>Actual</th>
              <th>Class</th>
              <th>Can grow</th>
              <th>Resize</th>
            </tr>
          </thead>
          <tbody>
            {data.volumes.map((v) => (
              <tr key={v.name}>
                <td>{v.name}</td>
                <td>
                  {v.shard}/{v.replica}
                </td>
                <td>{v.requested ?? "-"}</td>
                <td>
                  {v.actual ?? "-"}
                  {v.allocated && v.allocated !== v.actual && (
                    <span style={muted}> (allocating {v.allocated})</span>
                  )}
                </td>
                <td>{v.storageClass ?? "-"}</td>
                <td>{v.expandable === null ? "unknown" : v.expandable ? "yes" : "no"}</td>
                <td>{v.resizeState ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {data.capabilities?.disks === false ? (
        <Banner tone="info">{data.capabilities.disksMessage}</Banner>
      ) : (
        <Panel
          title="Free space"
          subtitle="Reported by ClickHouse®. Compare against the capacity above; neither number means much on its own."
        >
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Host</th>
                <th>Disk</th>
                <th>Free</th>
                <th>Total</th>
                <th>Used</th>
              </tr>
            </thead>
            <tbody>
              {data.disks.map((d, i) => {
                const used = d.total_space
                  ? Math.round(((d.total_space - d.free_space) / d.total_space) * 100)
                  : null;
                return (
                  <tr key={i}>
                    <td>{d.host}</td>
                    <td>{d.name}</td>
                    <td>{d.free_space}</td>
                    <td>{d.total_space}</td>
                    <td style={used > 80 ? { fontWeight: 600 } : undefined}>
                      {used === null ? "-" : `${used}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {info.length > 0 && (
        <Panel title="Worth knowing">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, ...muted }}>
            {info.map((w, i) => (
              <li key={i}>
                <strong>{w.volume}:</strong> {w.message}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

// Network

function NetworkTab({ data }) {
  if (!data) return null;
  const check = data.topologyCheck;

  return (
    <div>
      {check?.checked && check.missingFromClickHouse?.length > 0 && (
        <Banner tone="warn">
          <strong>Configured but not in ClickHouse®.</strong> Shard/replica{" "}
          {check.missingFromClickHouse.join(", ")} exist in the installation and
          not in remote_servers. A reconcile has not propagated.
        </Banner>
      )}

      {check?.checked && check.notRoutable?.length > 0 && (
        <Banner tone="warn">
          <strong>In ClickHouse® but not routable.</strong> Shard/replica{" "}
          {check.notRoutable.join(", ")} are configured and not receiving traffic.
        </Banner>
      )}

      {check && !check.checked && (
        <Banner tone="info">
          The three-way topology check could not run, because system.clusters was
          not readable from this endpoint.
        </Banner>
      )}

      {data.networkPolicies?.length > 0 && (
        <Banner tone="info">
          {data.networkPolicies.length} network polic
          {data.networkPolicies.length === 1 ? "y" : "ies"} restrict traffic to
          these pods. If a connection times out with correct credentials, this is
          the usual reason.
        </Banner>
      )}

      <Panel title="Services">
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>External address</th>
              <th>Ports</th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.type}</td>
                <td>{s.externalAddress ?? "-"}</td>
                <td>{s.ports.map((p) => p.port).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Disruption budgets">
        {data.disruptionBudgets.length === 0 ? (
          <div style={{ fontSize: 13, ...muted }}>
            None. A node drain can evict several replicas at once.
          </div>
        ) : (
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Allowed</th>
                <th>Healthy</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.disruptionBudgets.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td>{b.disruptionsAllowed}</td>
                  <td>
                    {b.currentHealthy} of {b.desiredHealthy}
                  </td>
                  <td>{b.reason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// Configuration

// Installations are written in YAML and kubectl prints YAML
function toYaml(value) {
  if (value === null || value === undefined) return "";
  try {
    return yaml.dump(value, { noRefs: true, lineWidth: 100, sortKeys: false });
  } catch {
    // A cyclic or otherwise undumpable object should show something rather than take the panel down.
    return JSON.stringify(value, null, 2);
  }
}

function ConfigTab({ data }) {
  if (!data) return null;

  return (
    <div>
      {data.drift && (
        <Banner tone="info">
          What was written and what is running differ. Templates are merged into
          the running form, so this is usually expected rather than a problem, and
          it is the most common reason a setting appears not to take hold.
        </Banner>
      )}

      {data.templates?.length > 0 && (
        <Panel title="Templates applied">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {data.templates.map((t, i) => (
              <li key={i}>{t.name ?? JSON.stringify(t)}</li>
            ))}
          </ul>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Written" subtitle="The installation as submitted">
          <pre style={{ fontSize: 12, maxHeight: 500, overflow: "auto" }}>
            {toYaml(data.written)}
          </pre>
        </Panel>
        <Panel title="Running" subtitle="After templates were merged in">
          <pre style={{ fontSize: 12, maxHeight: 500, overflow: "auto" }}>
            {toYaml(data.running)}
          </pre>
        </Panel>
      </div>

      <div style={{ fontSize: 12, ...muted }}>
        Anything password-shaped is removed before this leaves the server.
      </div>
    </div>
  );
}

// Events and logs

function EventsTab({ data }) {
  if (!data) return null;

  return (
    <Panel title="Recent events">
      {data.events.length === 0 ? (
        <div style={{ fontSize: 13, ...muted }}>No recent events.</div>
      ) : (
        <table className="data-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>When</th>
              <th>Object</th>
              <th>Reason</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((e, i) => (
              <tr key={i} style={e.type === "Warning" ? { fontWeight: 600 } : undefined}>
                <td style={{ whiteSpace: "nowrap" }}>{e.lastSeen}</td>
                <td>{e.object}</td>
                <td>{e.reason}</td>
                <td style={{ fontSize: 13 }}>
                  {e.message}
                  {e.count > 1 && <span style={muted}> ({e.count} times)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function LogsTab({ clusterId, hosts }) {
  const toast = useToast();
  const [pod, setPod] = useState(hosts?.[0]?.podName ?? "");
  const [previous, setPrevious] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);

  // Line count and time range persist, because somebody who wants 5000 lines wants them every time.
  const [lineCount, setLineCount] = useState(readLineCount);
  const [since, setSince] = useState(readSince);
  const [query, setQuery] = useState("");
  const [context, setContext] = useState(3);

  useEffect(() => {
    if (!pod && hosts?.length) setPod(hosts[0].podName);
  }, [hosts, pod]);

  function changeLineCount(n) {
    const v = clampLines(n);
    setLineCount(v);
    writeLineCount(v);
  }

  function changeSince(v) {
    setSince(v);
    writeSince(v);
  }

  async function load() {
    if (!pod) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        previous: String(previous),
        tailLines: String(lineCount),
      });
      // A dead container has no logs in the last N minutes
      const seconds = previous ? undefined : sinceSecondsFrom(since);
      if (seconds) params.set("sinceSeconds", String(seconds));

      setRaw(
        await apiFetchText(
          `/api/k8s/insight/${clusterId}/logs/${encodeURIComponent(pod)}?${params}`,
        ),
      );
      setFetchedAt(new Date());
    } catch (e) {
      toast.error("Could not read logs: " + e.message);
    }
    setBusy(false);
  }

  const lines = useMemo(() => splitLines(raw), [raw]);
  const result = useMemo(
    () => filterLines(lines, query, context),
    [lines, query, context],
  );

  const crashing = (hosts ?? []).find((h) => h.podName === pod)?.restartCount > 0;

  return (
    <div>
      {crashing && !previous && (
        <Banner tone="info">
          This pod has restarted. Turn on <strong>previous container</strong> to
          read what it printed before it died; a live read of a crash-looping pod
          usually returns almost nothing.
        </Banner>
      )}

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div className="form-group" style={{ flex: "1 1 260px", marginBottom: 0 }}>
          <label className="form-label">Pod</label>
          <Select
            className="form-select"
            value={pod}
            onChange={(e) => setPod(e.target.value)}
          >
            {(hosts ?? []).map((h) => (
              <option key={h.podName} value={h.podName}>
                {h.podName}
                {h.restartCount > 0 ? ` (${h.restartCount} restarts)` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">From</label>
          <input
            className="form-input"
            type="datetime-local"
            value={since}
            onChange={(e) => changeSince(e.target.value)}
            disabled={previous}
            title={
              previous
                ? "Not used when reading the previous container, which stopped before now."
                : "Read from this time onward. There is no end bound."
            }
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Lines</label>
          <LineCountControl value={lineCount} onChange={changeLineCount} disabled={busy} />
        </div>

        <label style={{ fontSize: 13, paddingBottom: 8, whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={previous}
            onChange={(e) => setPrevious(e.target.checked)}
          />{" "}
          previous container
        </label>

        <button
          className="btn btn-secondary"
          onClick={load}
          disabled={busy}
          style={{ marginBottom: 8 }}
        >
          {busy ? "Reading..." : "Read logs"}
        </button>
      </div>

      {/* Search filters what has already been fetched, so typing costs nothing
          and needs no round trip. Line count and From do require one. */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div className="form-group" style={{ flex: "1 1 300px", marginBottom: 0 }}>
          <label className="form-label">Search</label>
          <input
            className="form-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Case-insensitive. Try Error, Warning, or a table name."
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Context lines</label>
          <Select
            className="form-select"
            value={String(context)}
            onChange={(e) => setContext(Number(e.target.value))}
            style={{ width: 90 }}
          >
            {[0, 1, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          ...muted,
          marginBottom: 6,
        }}
      >
        <span>
          {raw
            ? query
              ? `${result.matched} of ${result.total} lines match`
              : `${result.total} lines`
            : ""}
        </span>
        {fetchedAt && <span>read at {fetchedAt.toLocaleTimeString()}</span>}
      </div>

      <pre
        style={{
          fontSize: 12,
          maxHeight: 600,
          overflow: "auto",
          background: "var(--bg-sunken)",
          padding: 12,
          borderRadius: "var(--radius-sm)",
          margin: 0,
        }}
      >
        {!raw
          ? "No logs loaded."
          : result.lines.length === 0
            ? `Nothing matches "${query}" in the ${result.total} lines read.`
            : result.lines.map((l) =>
                l.gap ? (
                  <div key={l.i} style={{ ...muted, userSelect: "none" }}>
                    ---
                  </div>
                ) : (
                  <div
                    key={l.i}
                    style={l.hit ? { background: "var(--color-warning-bg)" } : undefined}
                  >
                    {l.text}
                  </div>
                ),
              )}
      </pre>
    </div>
  );
}

// Same shape as the editor's Max rows control: minus, editable field, plus.
function LineCountControl({ value, onChange, disabled }) {
  const step = (delta) => onChange(value + delta);

  return (
    <span className="mx-rows">
      <span className="mx-rows-group">
        <button
          type="button"
          className="mx-rows-btn"
          onClick={() => step(-LOG_LINES_STEP)}
          disabled={disabled || value <= LOG_LINES_MIN}
          aria-label="Fewer lines"
        >
          &minus;
        </button>
        <input
          className="mx-rows-input"
          type="number"
          min={LOG_LINES_MIN}
          max={LOG_LINES_MAX}
          step={LOG_LINES_STEP}
          defaultValue={value}
          key={value}
          onBlur={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            e.stopPropagation();
          }}
          aria-label="Lines to read"
          disabled={disabled}
        />
        <button
          type="button"
          className="mx-rows-btn"
          onClick={() => step(LOG_LINES_STEP)}
          disabled={disabled || value >= LOG_LINES_MAX}
          aria-label="More lines"
        >
          +
        </button>
      </span>
    </span>
  );
}

export default function KubernetesInsight({ cluster }) {
  const toast = useToast();
  const [tab, setTab] = useState("health");
  const [data, setData] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (which) => {
      setBusy(true);
      try {
        const r = await apiFetch(`/api/k8s/insight/${cluster.id}/${which}`);
        setData((p) => ({ ...p, [which]: r }));
      } catch (e) {
        toast.error(e.message);
      }
      setBusy(false);
    },
    [cluster.id, toast],
  );

  useEffect(() => {
    // Logs need the pod list, which comes from topology.
    const needed = tab === "logs" ? "topology" : tab;
    if (!data[needed]) load(needed);
    // `data` is deliberately not a dependency: including it would refetch on every state
  }, [tab, load]);

  async function refresh() {
    setBusy(true);
    try {
      await apiFetch(`/api/k8s/insight/${cluster.id}/refresh`, {
        method: "POST",
        body: {},
      });
      setData({});
      toast.success("Refreshed.");
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={
                tab === t.id ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={busy}>
          <Icon className="ti ti-refresh" /> Refresh
        </button>
      </div>

      {busy && <div style={{ ...muted, fontSize: 13 }}>Loading...</div>}

      {tab === "health" && <HealthTab data={data.health} />}
      {tab === "topology" && <TopologyTab data={data.topology} />}
      {tab === "reconcile" && <ReconcileTab data={data.reconcile} />}
      {tab === "storage" && <StorageTab data={data.storage} />}
      {tab === "network" && <NetworkTab data={data.network} />}
      {tab === "config" && <ConfigTab data={data.config} />}
      {tab === "events" && <EventsTab data={data.events} />}
      {tab === "logs" && (
        <LogsTab clusterId={cluster.id} hosts={data.topology?.hosts} />
      )}
    </div>
  );
}
