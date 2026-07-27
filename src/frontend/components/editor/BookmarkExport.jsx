// Copyright (C) 2026 Quantrail™ Data Private Limited
// BookmarkExport.jsx - get saved queries out, and bring them back.
// Contributors - Kathirdhasan, Praveen kumar, Kathir Moorthy


import React, { useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import {
  FORMATS,
  CHOICES,
  exportFileName,
  downloadText,
  parseImport,
  planImport,
  applyImport,
  summarise,
} from "../../utils/bookmarkExport.js";

const CHOICE_LABELS = [
  [CHOICES.KEEP, "Keep mine"],
  [CHOICES.REPLACE, "Take theirs"],
  [CHOICES.BOTH, "Keep both"],
];

export default function BookmarkExport({ bookmarks, onImport }) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [choices, setChoices] = useState({});

  const empty = !bookmarks || bookmarks.length === 0;

  function download(fmt) {
    downloadText(exportFileName(fmt.id), fmt.write(bookmarks), fmt.mime);
  }

  async function pick(e) {
    const file = e.target.files?.[0];
    // Cleared immediately so choosing the same file twice still fires.
    e.target.value = "";
    if (!file) return;

    setError(null);
    let text;
    try {
      text = await file.text();
    } catch {
      setError("That file could not be read.");
      return;
    }

    const parsed = parseImport(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    const next = planImport(bookmarks || [], parsed.bookmarks);
    const conflicts = next.filter((p) => p.status === "conflict");

    // Nothing to decide: apply it. Showing a review with no questions on it
    // would be ceremony rather than safety.
    if (!conflicts.length) {
      onImport(applyImport(bookmarks || [], next));
      setPlan(null);
      return;
    }
    setChoices(Object.fromEntries(conflicts.map((c) => [c.incoming.name, CHOICES.KEEP])));
    setPlan(next);
  }

  function confirm() {
    onImport(applyImport(bookmarks || [], plan, choices));
    setPlan(null);
    setChoices({});
  }

  const counts = plan ? summarise(plan, choices) : null;

  return (
    <div style={{ borderTop: "1px solid var(--border-default)", marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Export as</span>
        {FORMATS.map((f) => (
          <button
            key={f.id}
            className="btn btn-ghost btn-sm"
            onClick={() => download(f)}
            disabled={empty}
            title={f.hint}
          >
            <Icon className="ti ti-download" /> {f.label}
          </button>
        ))}

        <span style={{ flex: 1 }} />

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => fileRef.current?.click()}
          title="Import a JSON export. Nothing is run; queries are only stored."
        >
          <Icon className="ti ti-upload" /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={pick}
          style={{ display: "none" }}
          aria-label="Import bookmarks"
        />
      </div>

      <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 6 }}>
        Only the JSON export can be imported. Markdown and SQL drop the
        parameter defaults, so they are one-way.
      </div>

      {error && (
        <div className="alert-banner danger" style={{ marginTop: 10, fontSize: "0.75rem" }}>
          <Icon className="ti ti-alert-circle" />
          <span>{error}</span>
        </div>
      )}

      {plan && (
        <div className="modal-overlay" onClick={() => setPlan(null)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 720, width: "95%" }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6 }}>
              Some of these already exist
            </h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 14px" }}>
              Nothing has changed yet. Queries that match exactly are left alone
              and are not listed.
            </p>

            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {plan
                .filter((p) => p.status === "conflict")
                .map((p) => (
                  <div
                    key={p.incoming.name}
                    style={{
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border-default)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginBottom: 6 }}>
                      {p.incoming.name}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {CHOICE_LABELS.map(([value, label]) => (
                        <button
                          key={value}
                          className={
                            "btn btn-sm " +
                            (choices[p.incoming.name] === value ? "btn-primary" : "btn-ghost")
                          }
                          onClick={() =>
                            setChoices((c) => ({ ...c, [p.incoming.name]: value }))
                          }
                          title={
                            value === CHOICES.BOTH
                              ? `Adds it as "${p.copyName}"`
                              : undefined
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                gap: 12,
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {counts.added} added, {counts.replaced} replaced, {counts.kept} left
                alone{counts.identical ? `, ${counts.identical} already identical` : ""}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPlan(null)}>
                  Cancel
                </button>
                {/* Not "Import": the toolbar button behind this overlay says
                    that already, and two buttons with one label a few hundred
                    pixels apart is a question the user should not have to ask. */}
                <button className="btn btn-primary btn-sm" onClick={confirm}>
                  Apply import
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
