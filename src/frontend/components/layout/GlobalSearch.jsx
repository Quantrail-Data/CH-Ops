// GlobalSearch - app-wide page finder.
//
// Opened from the navbar Search button, the floating bubble, or Ctrl/Cmd+K.
// Uses Fuse.js multi-word token search over the page catalog so a natural query
// like "DDL queue block" surfaces the right pages ranked by relevance. The
// panel is the shadcn/ui CommandDialog (cmdk): results update as the user
// types, arrow keys and Enter work, long lists scroll, and the panel closes on
// Escape, a backdrop click, or the close button. Fuse does the ranking, so the
// cmdk filter is off.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { useState, useMemo, useEffect, useCallback } from "react";
import Fuse from "fuse.js";
import Icon from "../common/Icon.jsx";
import { Kbd } from "../ui/index.jsx";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command.jsx";
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
  threshold: 0.3,
  keys: [
    { name: "title", weight: 3 },
    { name: "keywords", weight: 2 },
    { name: "section", weight: 1 },
    { name: "description", weight: 1 },
    { name: "text", weight: 0.2 },
  ],
});

const SUGGESTIONS = SUGGESTED_IDS.map((id) =>
  SEARCH_ENTRIES.find((e) => e.id === id),
).filter(Boolean);

// Any component can open the palette (e.g. the Home page search field)
// without a prop chain: requestGlobalSearch() fires this window event.
export const OPEN_SEARCH_EVENT = "chops:open-search";
export function requestGlobalSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

export default function GlobalSearch({ open, onOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState("");

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
    const onRequest = () => onOpen();
    // Capture phase, so a focused widget that stops the key event (for
    // example a shadcn menu or button) cannot block the shortcut.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(OPEN_SEARCH_EVENT, onRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(OPEN_SEARCH_EVENT, onRequest);
    };
  }, [onOpen]);

  // Start empty each time the panel opens.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const select = useCallback(
    (item) => {
      if (!item) return;
      onNavigate(item.id);
      onClose();
    },
    [onNavigate, onClose],
  );

  // The dialog reports Escape and a backdrop click as a close request.
  function onOpenChange(nextOpen) {
    if (!nextOpen) onClose();
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

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Search pages"
        description="Find a page or feature by name or by what it does."
        className="global-search-panel tw:top-[12vh] tw:w-[min(640px,92vw)] tw:max-w-[min(640px,92vw)] tw:sm:max-w-[min(640px,92vw)] tw:border tw:border-[var(--border-strong)] tw:bg-[var(--bg-raised)] tw:shadow-[var(--shadow-lg)] tw:ring-0"
      >
        <Command shouldFilter={false} loop className="tw:rounded-none! tw:bg-transparent tw:p-0">
          <div className="tw:relative">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages and features..."
              aria-label="Search pages and features"
              spellCheck={false}
              className="tw:h-11 tw:font-sans tw:text-[length:var(--text-base)]"
            />
            <button
              type="button"
              className="global-search-close tw:absolute tw:top-1/2 tw:right-3 tw:-translate-y-1/2"
              onClick={onClose}
              title="Close"
              aria-label="Close search"
            >
              <Kbd>Esc</Kbd>
            </button>
          </div>

          <CommandList className="global-search-results tw:max-h-[min(52vh,480px)] tw:p-1.5">
            <CommandEmpty className="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:text-[var(--text-muted)]">
              <Icon className="ti ti-list-search" style={{ fontSize: "1.375rem", opacity: 0.5 }}></Icon>
              <span>No pages match &quot;{trimmed}&quot;</span>
            </CommandEmpty>
            {results.length > 0 && (
              <CommandGroup heading={trimmed ? "Pages" : "Suggested pages"} className="global-search-hint-group">
                {results.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => select(item)}
                    className="global-search-item tw:gap-3 tw:rounded-[var(--radius-sm)] tw:px-2.5 tw:py-2"
                  >
                    <span className="global-search-item-icon">
                      <Icon className={`ti ${SECTION_ICONS[item.section] || "ti-file"}`}></Icon>
                    </span>
                    <span className="global-search-item-body">
                      <span className="global-search-item-title">{item.title}</span>
                      {item.description && (
                        <span className="global-search-item-desc">{item.description}</span>
                      )}
                    </span>
                    <span className="global-search-item-section">{item.section}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

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
        </Command>
      </CommandDialog>
    </>
  );
}
