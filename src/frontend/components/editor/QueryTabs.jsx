// Copyright (C) 2026 Quantrail™ Data Private Limited
// QueryTabs.jsx - the SQL Editor's tab strip.
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar

import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";

/* Has this tab produced anything? */
function hasRun(rt) {
  if (!rt) return false;
  return Boolean(rt.lastQueryId || rt.result || rt.error || rt.successMsg);
}

export function needsCloseConfirm(tab, rt) {
  return Boolean(tab?.sql?.trim()) && !hasRun(rt);
}

export default function QueryTabs({
  tabs,
  activeId,
  runtime = {},
  canAdd = true,
  // False when this editor is mounted but hidden, which happens while
  // Comparison mode is showing. A hidden pane must not answer Ctrl+1.
  keyboardEnabled = true,
  hint = "Ctrl+Enter to run | Ctrl+B bookmarks",
  onSelect,
  onAdd,
  onClose,
  onRename,
  // Whether closing this tab needs asking first.
  confirmClose = null,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Ctrl+1 to Ctrl+9.
  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const tab = tabs[n - 1];
      if (!tab) return;
      e.preventDefault();
      onSelect?.(tab.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tabs, onSelect, keyboardEnabled]);

  const startRename = useCallback((tab) => {
    setEditingId(tab.id);
    setDraft(tab.name);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId) onRename?.(editingId, draft);
    setEditingId(null);
  }, [editingId, draft, onRename]);

  const handleClose = useCallback(
    (e, tab) => {
      e.stopPropagation();
      if (confirmClose && needsCloseConfirm(tab, runtime[tab.id])) {
        // The owner takes it from here, asynchronously if it wants to.
        confirmClose(tab);
        return;
      }
      onClose?.(tab.id);
    },
    [runtime, onClose, confirmClose],
  );

  return (
    <div className="qtabs" role="tablist" aria-label="Query tabs">
      <div className="qtabs-list">
        {tabs.map((tab, i) => {
          const active = tab.id === activeId;
          const running = Boolean(runtime[tab.id]?.running);
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={i < 9 ? `${tab.name}  (Ctrl+${i + 1})` : tab.name}
              className={`qtab${active ? " active" : ""}`}
              onClick={() => onSelect?.(tab.id)}
              onDoubleClick={() => startRename(tab)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect?.(tab.id);
              }}
            >
              {running && (
                <Icon
                  className="ti ti-loader-2 qtab-spin"
                  aria-label="Running"
                  title="A query is running in this tab"
                />
              )}

              {editingId === tab.id ? (
                <input
                  ref={inputRef}
                  className="qtab-rename"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    // Escape abandons the edit; the old name is still in the tab.
                    if (e.key === "Escape") setEditingId(null);
                    e.stopPropagation();
                  }}
                  aria-label="Rename tab"
                />
              ) : (
                <span className="qtab-name">{tab.name}</span>
              )}

              {/* Always rendered, revealed on hover by CSS. Rendering it only on
                  hover makes the tab change width as the pointer crosses it. */}
              <button
                type="button"
                className="qtab-close"
                aria-label={`Close ${tab.name}`}
                title="Close"
                onClick={(e) => handleClose(e, tab)}
              >
                <Icon className="ti ti-x" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="qtab-add"
          onClick={() => onAdd?.()}
          disabled={!canAdd}
          aria-label="New query tab"
          title={canAdd ? "New tab" : "Maximum tabs reached"}
        >
          <Icon className="ti ti-plus" />
        </button>
      </div>

      <div className="qtabs-hint">{hint}</div>
    </div>
  );
}
