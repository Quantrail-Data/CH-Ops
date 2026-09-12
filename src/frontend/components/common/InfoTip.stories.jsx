// InfoTip is a specific hover/focus tooltip for explaining a metric (what it
// is, how to read it, its formula, and the server's own description of the
// underlying raw fields). For a plain generic tooltip on arbitrary content,
// see components/ui/Tooltip.stories.jsx instead.
import InfoTip from "./InfoTip.jsx";

export default {
  title: "Existing/InfoTip",
  component: InfoTip,
};

export const Basic = {
  args: {
    what: "Queries per second, averaged over the selected window.",
    read: "A sustained rise without a matching drop in latency usually means capacity is fine.",
  },
};

export const WithFormula = {
  args: {
    what: "Cache hit ratio for the mark cache.",
    read: "Below 90% on a hot table usually means the cache is undersized for the working set.",
    formula: "hits / (hits + misses)",
    unit: "ratio",
  },
};

export const WithServerNotes = {
  args: {
    what: "Memory currently used by merges.",
    read: "Persistently high values crowd out query memory.",
    formula: "sum(MemoryTrackingForMerges)",
    serverNotes: [{ name: "MemoryTrackingForMerges", text: "Total amount of memory allocated for background merges." }],
  },
};
