//@author: Sanjeev Kumar G

// DistReplTab.jsx
// Live snapshot of one queue: replication_queue OR distribution_queue, selected
// by the `view` prop ("replication" | "distribution"). No stored history;
// refreshes on a timer with a delta-since-last-refresh.

import React, { useEffect, useState, useRef, useCallback } from "react";
import DataTable from "../layout/DataTable.jsx";
import QueueCards from "./QueueCards.jsx";
import RankedBar from "./RankedBar.jsx";
import EmptyState from "./EmptyState.jsx";
import { fmtInt, fmtAge } from "../../utils/queueFormat.js";
import { fmtBytes } from "../../utils/costEstimator.js";
import { loadReplication, loadDistribution } from "../../utils/queueQueries.js";

const REFRESH_MS = 30000;

// Format a delta like "+18" / "-3" / "" (no change / first load).
function delta(curr, prev) {
  if (prev == null || curr == null) return "";
  const d = Number(curr) - Number(prev);
  if (d === 0) return "";
  return d > 0 ? `+${fmtInt(d)}` : `${fmtInt(d)}`;
}

export default function DistReplTab({ view = "replication" }) {
  const isRepl = view === "replication";

  const [repl, setRepl] = useState(null);
  const [dist, setDist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [chips, setChips] = useState({ executing: false, errored: false });

  // Remember previous card values to show deltas.
  const prevRef = useRef({ replTotal: null, distFiles: null });

  const load = useCallback(async () => {
    try {
      if (isRepl) {
        const r = await loadReplication();
        setRepl(r);
        prevRef.current.replTotal = r?.cards ? Number(r.cards.total_pending) : null;
      } else {
        const d = await loadDistribution();
        setDist(d);
        prevRef.current.distFiles = d?.cards ? Number(d.cards.files_waiting) : null;
      }
    } catch (e) {
      // Never leave the tab stuck on the spinner if a snapshot query fails.
      console.error("Queue snapshot failed:", e.message);
      if (isRepl) setRepl((p) => p ?? { present: false, cards: null, tasks: [], typeMix: [], depth: [] });
      else setDist((p) => p ?? { present: false, cards: null, rows: [] });
    } finally {
      setLoading(false);
    }
  }, [isRepl]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return <div className="queue-loading"><span className="loading-spinner"></span> Loading queue state...</div>;
  }

  // Apply client-side filter + chips to the replication task list.
  const filterTasks = (tasks) => {
    const f = filter.trim().toLowerCase();
    return tasks.filter((t) => {
      if (chips.executing && Number(t.is_currently_executing) !== 1) return false;
      if (chips.errored && !(t.last_exception && t.last_exception !== "")) return false;
      if (!f) return true;
      return [t.database, t.table, t.replica_name, t.type, t.last_exception, t.postpone_reason]
        .some((v) => String(v || "").toLowerCase().includes(f));
    });
  };

  // Replication view
  if (isRepl) {
    if (!repl?.present) {
      return (
        <EmptyState icon="ti-git-branch" title="No replicated tables">
          This server has no ReplicatedMergeTree tables, so there is no
          replication queue to monitor. The queue tracks parts being fetched,
          merged, and mutated across replicas.
        </EmptyState>
      );
    }
    return (
      <div className="queue-tab">
        <QueueCards cards={[
          {
            label: "Pending tasks",
            value: fmtInt(repl.cards?.total_pending),
            delta: delta(repl.cards?.total_pending, prevRef.current.replTotal),
            state: Number(repl.cards?.total_pending) > 0 ? "warn" : "ok",
          },
          { label: "Executing now", value: fmtInt(repl.cards?.executing), state: "neutral" },
          {
            label: "Oldest task",
            value: fmtAge(repl.cards?.oldest_age_seconds),
            state: Number(repl.cards?.oldest_age_seconds) > 1800 ? "warn" : "neutral",
          },
        ]} />

        <div className="queue-grid-2">
          <section className="queue-panel">
            <h3 className="queue-panel-title">Depth per table / replica</h3>
            <RankedBar
              items={repl.depth.map((d) => ({
                label: `${d.tbl} (${d.replica_name})`,
                value: Number(d.depth),
                sub: `oldest ${fmtAge(d.oldest_age_seconds)}`,
              }))}
              valueFormat={fmtInt}
            />
          </section>
          <section className="queue-panel">
            <h3 className="queue-panel-title">Task types</h3>
            <RankedBar
              items={repl.typeMix.map((m) => ({ label: m.type, value: Number(m.cnt) }))}
              valueFormat={fmtInt}
            />
          </section>
        </div>

        <section className="queue-panel">
          <div className="queue-panel-head">
            <h3 className="queue-panel-title">Tasks (most retried first)</h3>
            <div className="queue-filter-row">
              <input className="form-input" placeholder="Filter tasks..."
                value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button
                className={"queue-chip" + (chips.executing ? " active" : "")}
                onClick={() => setChips((c) => ({ ...c, executing: !c.executing }))}
              >Executing</button>
              <button
                className={"queue-chip" + (chips.errored ? " active" : "")}
                onClick={() => setChips((c) => ({ ...c, errored: !c.errored }))}
              >With errors</button>
            </div>
          </div>
          <DataTable
            variant="fixed"
            rows={filterTasks(repl.tasks).map((t) => ({
              Table: `${t.database}.${t.table}`,
              Replica: t.replica_name,
              Type: t.type,
              Age: fmtAge(t.age_seconds),
              Tries: Number(t.num_tries),
              Postponed: Number(t.num_postponed),
              Executing: Number(t.is_currently_executing) === 1 ? "yes" : "",
              "Postpone reason": t.postpone_reason || "",
              "Last exception": t.last_exception || "",
            }))}
          />
        </section>
      </div>
    );
  }

  // Distribution view
  if (!dist?.present) {
    return (
      <EmptyState icon="ti-topology-ring" title="No distributed tables">
        This server has no Distributed tables sending data to shards, so there
        is no distribution queue. The queue tracks locally-buffered inserts
        waiting to ship to remote shards.
      </EmptyState>
    );
  }
  return (
    <div className="queue-tab">
      <QueueCards cards={[
        {
          label: "Files waiting",
          value: fmtInt(dist.cards?.files_waiting),
          delta: delta(dist.cards?.files_waiting, prevRef.current.distFiles),
          state: Number(dist.cards?.files_waiting) > 0 ? "warn" : "ok",
        },
        { label: "Bytes waiting", value: fmtBytes(dist.cards?.bytes_waiting), state: "neutral" },
        {
          label: "Blocked",
          value: fmtInt(dist.cards?.blocked),
          state: Number(dist.cards?.blocked) > 0 ? "bad" : "ok",
        },
        {
          label: "Broken files",
          value: fmtInt(dist.cards?.broken_files),
          state: Number(dist.cards?.broken_files) > 0 ? "bad" : "ok",
        },
      ]} />

      <section className="queue-panel">
        <h3 className="queue-panel-title">Distributed tables</h3>
        <DataTable
          variant="fixed"
          rows={dist.rows.map((r) => ({
            Table: `${r.database}.${r.table}`,
            Blocked: Number(r.is_blocked) === 1 ? "yes" : "",
            "Files waiting": fmtInt(r.data_files),
            "Bytes waiting": fmtBytes(r.data_compressed_bytes),
            "Broken files": Number(r.broken_data_files),
            Errors: Number(r.error_count),
            "Last exception": r.last_exception || "",
          }))}
        />
      </section>
    </div>
  );
}
