// GlobalSearch - app-wide page finder.
//
// Opened from the navbar Search button, the floating bubble, or Ctrl/Cmd+K.
// Uses Fuse.js multi-word token search over the page catalog so a natural query
// like "DDL queue block" surfaces the right pages ranked by relevance. Results
// update as the user types, are keyboard navigable, scroll when long, and the
// panel closes on Escape, a backdrop click, or the close button.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import Icon from "../common/Icon.jsx";
import { SEARCH_ENTRIES, SECTION_ICONS } from "../../utils/searchCatalog.js";

// A few high-traffic pages shown before the user types anything.
const SUGGESTED_IDS = [
  "overview/cluster",
  "editor/query",
  "tools/profiler",
  "overview/ddl",
  "alerting/rules",
  "logs/error",
];

// Built once at module load, not per keystroke. Token search splits the query
// into words, fuzzy-matches each independently, and ranks with IDF weighting;
// ignoreLocation lets a match anywhere in a field count; the threshold leans
// toward precision so a small curated catalog does not return vague hits.
const fuse = new Fuse(SEARCH_ENTRIES, {
  useTokenSearch: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.4,
  keys: [
    { name: "title", weight: 3 },
    { name: "keywords", weight: 2 },
    { name: "section", weight: 1 },
    { name: "description", weight: 1 },
    { name: "text", weight: 0.5 },
  ],
});

const SUGGESTIONS = SUGGESTED_IDS.map((id) =>
  SEARCH_ENTRIES.find((e) => e.id === id),
).filter(Boolean);

export default function GlobalSearch({ open, onOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!trimmed) return SUGGESTIONS;
    return fuse.search(trimmed, { limit: 20 }).map((r) => r.item);
  }, [trimmed]);

  // Global shortcut: Ctrl/Cmd+K opens the palette from anywhere.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);

  // Reset when the panel closes; focus the input when it opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery("");
    setActiveIndex(0);
    return undefined;
  }, [open]);

  // Keep the highlighted row valid as results change.
  useEffect(() => {
    setActiveIndex((i) => (i >= results.length ? 0 : i));
  }, [results.length]);

  // Scroll the highlighted row into view.
  useEffect(() => {
    const el = resultsRef.current?.querySelector(".global-search-item.active");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  const select = useCallback(
    (item) => {
      if (!item) return;
      onNavigate(item.id);
      onClose();
    },
    [onNavigate, onClose],
  );

  function handleInputKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        results.length ? (i - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <>
      {/* Floating bubble - hidden while the panel is open */}
      {!open && (
        <button
          className="global-search-fab"
          onClick={onOpen}
          title="Search (Ctrl/Cmd + K)"
          aria-label="Search"
        >
          <Icon className="ti ti-search"></Icon>
        </button>
      )}

      {open && (
        <div
          className="global-search-overlay"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Search pages"
        >
          <div
            className="global-search-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="global-search-input-row">
              <Icon
                className="ti ti-search global-search-input-icon"
              ></Icon>
              <input
                ref={inputRef}
                className="global-search-input"
                type="text"
                placeholder="Search pages and features..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search pages and features"
              />
              <button
                className="global-search-close"
                onClick={onClose}
                title="Close"
                aria-label="Close search"
              >
                <Icon className="ti ti-x"></Icon>
              </button>
            </div>

            {!trimmed && (
              <div className="global-search-hint">Suggested pages</div>
            )}

            <div className="global-search-results" ref={resultsRef}>
              {results.length === 0 ? (
                <div className="global-search-empty">
                  <Icon
                    className="ti ti-list-search"
                    style={{ fontSize: 22, opacity: 0.5 }}
                  ></Icon>
                  <span>No pages match "{trimmed}"</span>
                </div>
              ) : (
                results.map((item, i) => (
                  <div
                    key={item.id}
                    className={`global-search-item ${i === activeIndex ? "active" : ""}`}
                    onMouseMove={() => setActiveIndex(i)}
                    onClick={() => select(item)}
                  >
                    <span className="global-search-item-icon">
                      <Icon
                        className={`ti ${SECTION_ICONS[item.section] || "ti-file"}`}
                      ></Icon>
                    </span>
                    <span className="global-search-item-body">
                      <span className="global-search-item-title">
                        {item.title}
                        <span className="global-search-item-section">
                          {item.section}
                        </span>
                      </span>
                      {item.description && (
                        <span className="global-search-item-desc">
                          {item.description}
                        </span>
                      )}
                    </span>
                    <Icon
                      className="ti ti-chevron-right global-search-item-go"
                    ></Icon>
                  </div>
                ))
              )}
            </div>

            <div className="global-search-footer">
              <span>
                <span className="global-search-kbd">Up</span>
                <span className="global-search-kbd">Down</span>
                to navigate
              </span>
              <span>
                <span className="global-search-kbd">Enter</span>
                to open
              </span>
              <span>
                <span className="global-search-kbd">Esc</span>
                to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
