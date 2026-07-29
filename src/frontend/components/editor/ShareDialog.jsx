// Copyright (C) 2026 Quantrail™ Data Private Limited
// ShareDialog.jsx - hand someone the query you are looking at.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import React, { useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import { buildShareUrl, LINK_WARN_CHARS } from "../../utils/shareLink.js";

export default function ShareDialog({ sql, params, onClose, onExportBookmarks }) {
  // Off by default, and deliberately so.
  const [includeParams, setIncludeParams] = useState(false);
  const [copied, setCopied] = useState(false);

  const filled = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && String(v).trim() !== "") out[k] = v;
    }
    return out;
  }, [params]);

  const hasParams = Object.keys(filled).length > 0;
  const url = useMemo(
    () => buildShareUrl(sql, includeParams ? filled : null),
    [sql, includeParams, filled],
  );
  const tooLong = url.length > LINK_WARN_CHARS;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused. The link is on screen and selectable,
      // so there is nothing to recover from and nothing worth interrupting for.
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620, width: "95%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon className="ti ti-link" style={{ color: "var(--accent)" }} /> Share this query
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon className="ti ti-x" />
          </button>
        </div>

        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "0 0 12px" }}>
          The link contains a copy of this query. Editing it afterwards will not
          change what the link opens.
        </p>

        <input
          className="form-input"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          aria-label="Share link"
          style={{ width: "100%", fontFamily: "var(--font-code)", fontSize: "0.75rem" }}
        />

        {hasParams && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "12px 0 0",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={includeParams}
              onChange={(e) => setIncludeParams(e.target.checked)}
            />
            <span>
              Include the {Object.keys(filled).length} parameter value
              {Object.keys(filled).length === 1 ? "" : "s"} currently filled in
            </span>
          </label>
        )}

        {includeParams && (
          <div className="alert-banner" style={{ marginTop: 10, fontSize: "0.75rem" }}>
            <Icon className="ti ti-alert-circle" />
            <span>
              The values are in the link. Anyone it reaches can read them, so
              send it the way you would send the values themselves.
            </span>
          </div>
        )}

        {tooLong && (
          <div className="alert-banner danger" style={{ marginTop: 10, fontSize: "0.75rem" }}>
            <Icon className="ti ti-alert-triangle" />
            <span>
              This link is {url.length.toLocaleString()} characters. Some chat
              and mail clients will break it.{" "}
              {onExportBookmarks
                ? "Saving the query and exporting your bookmarks may work better."
                : "Sharing the query as a file may work better."}
            </span>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border-default)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          {/* People will assume a link grants access. It does not, and saying so
              here is cheaper than explaining it afterwards. */}
          Opening this link does not grant access to anything. Whoever follows it
          signs in as themselves, connects with their own ClickHouse credentials,
          and sees only what their own grants allow.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary btn-sm" onClick={copy}>
            <Icon className={copied ? "ti ti-check" : "ti ti-copy"} />{" "}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}
