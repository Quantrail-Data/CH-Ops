// jemallocParser.js - Parser for system.jemalloc_stats raw text output
//
// Parses the fixed-width columnar text dump from system.jemalloc_stats into
// structured JavaScript objects. Extracts overview metrics (allocated, active,
// mapped, resident, retained, metadata, fragmentation), per-arena stats, bin
// allocations, large allocations, extents data, and mutex contention stats.
// Uses regex patterns that match jemalloc's exact column layouts.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
export function fmtBytes(bytes) {
  if (bytes == null || isNaN(bytes) || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Math.abs(bytes);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export function fmtRate(n) {
  return Number(n || 0).toFixed(2);
}

// Overview Parser
//
// Extracts the top-level summary metrics from the stats text:
// Allocated, Active, Mapped, Resident, Retained, Metadata, Dirty, Muzzy, PageSize.
//
// These appear near the top of the dump in lines like:
//   "Allocated: 499296096, active: 546709504, metadata: 23456789, ..."
//   "Page size: 4096"
//   "   dirty:   N/A   14223   2669   27202   1389554"

export function parseOverview(text) {
  const lines = text.split('\n');
  const o = {};

  for (const line of lines) {
    // Page size
    if (line.includes('Page size:')) {
      const m = line.match(/Page size:\s*(\d+)/);
      if (m) o.pageSize = parseInt(m[1], 10);
    }

    // Main stats line: "Allocated: 499296096, active: 546709504, ..."
    if (line.includes('Allocated:') && line.includes('active:')) {
      const a = line.match(/Allocated:\s*(\d+)/);
      const b = line.match(/active:\s*(\d+)/);
      const c = line.match(/metadata:\s*(\d+)/);
      const d = line.match(/mapped:\s*(\d+)/);
      const e = line.match(/retained:\s*(\d+)/);
      const f = line.match(/resident:\s*(\d+)/);
      if (a) o.allocated = parseInt(a[1], 10);
      if (b) o.active    = parseInt(b[1], 10);
      if (c) o.metadata  = parseInt(c[1], 10);
      if (d) o.mapped    = parseInt(d[1], 10);
      if (e) o.retained  = parseInt(e[1], 10);
      if (f) o.resident  = parseInt(f[1], 10);
    }

    // Dirty pages:  "   dirty:   N/A   14223   ..."
    // Format: dirty: time npages sweeps madvises purged
    if (line.match(/^\s+dirty:/) && o.pageSize) {
      const m = line.match(/^\s+dirty:\s+\S+\s+(\d+)/);
      if (m) o.dirty = parseInt(m[1], 10) * o.pageSize;
    }

    // Muzzy pages
    if (line.match(/^\s+muzzy:/) && o.pageSize) {
      const m = line.match(/^\s+muzzy:\s+\S+\s+(\d+)/);
      if (m) o.muzzy = parseInt(m[1], 10) * o.pageSize;
    }
  }

  // Derived
  const allocated = o.allocated || 0;
  const active = o.active || 0;
  o.fragmentation = allocated > 0 ? ((active - allocated) / allocated) * 100 : 0;
  o.efficiency = active > 0 ? (allocated / active) * 100 : 0;

  return o;
}

// Arena Parser
//
// Extracts per-arena metrics. Each arena starts with:
//   "arenas[0]:"
// Followed by stats like:
//   "  assigned threads:  8"
//   "  total:  123456789"
//   "  active:  100000000"

export function parseArenas(text) {
  const lines = text.split('\n');
  const arenas = [];
  let current = null;

  for (const line of lines) {
    const arenaMatch = line.match(/^arenas\[(\d+)\]:/);
    if (arenaMatch) {
      current = { id: parseInt(arenaMatch[1], 10), stats: {} };
      arenas.push(current);
      continue;
    }
    if (!current) continue;

    if (line.match(/^\s*assigned threads:/)) {
      const m = line.match(/^\s*assigned threads:\s+(\d+)/);
      if (m) current.stats.assigned_threads = parseInt(m[1], 10);
    }
    if (line.match(/^\s*total:/)) {
      const m = line.match(/^\s*total:\s+(\d+)/);
      if (m) current.stats.allocated = parseInt(m[1], 10);
    }
    if (line.match(/^\s*(active|mapped|retained|resident):/)) {
      const m = line.match(/^\s*(active|mapped|retained|resident):\s+(\d+)/);
      if (m) current.stats[m[1]] = parseInt(m[2], 10);
    }
  }

  return arenas;
}

// Arena Allocations Parser
//
// Extracts small/large/total allocation stats per arena.
// Lines look like:
//   "  small:  123  456  78  901  23  456  78  901  23  456  78  901"
//   "  large:  ..."
//   "  total:  ..."
// 12 numeric fields: allocated nmalloc nmalloc_ps ndalloc ndalloc_ps
//   nrequests nrequests_ps nfill nfill_ps nflush nflush_ps

export function parseArenaAllocations(text) {
  const lines = text.split('\n');
  const result = {};
  let currentArena = null;
  let inArena = false;

  for (const line of lines) {
    const arenaMatch = line.match(/^arenas\[(\d+)\]:/);
    if (arenaMatch) {
      currentArena = parseInt(arenaMatch[1], 10);
      result[currentArena] = { small: null, large: null, total: null };
      inArena = true;
      continue;
    }

    const allocMatch = line.match(
      /^\s*(small|large|total):\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
    );
    if (allocMatch) {
      const data = {
        type:         allocMatch[1],
        allocated:    parseInt(allocMatch[2], 10),
        nmalloc:      parseInt(allocMatch[3], 10),
        nmalloc_ps:   parseInt(allocMatch[4], 10),
        ndalloc:      parseInt(allocMatch[5], 10),
        ndalloc_ps:   parseInt(allocMatch[6], 10),
        nrequests:    parseInt(allocMatch[7], 10),
        nrequests_ps: parseInt(allocMatch[8], 10),
        nfill:        parseInt(allocMatch[9], 10),
        nfill_ps:     parseInt(allocMatch[10], 10),
        nflush:       parseInt(allocMatch[11], 10),
        nflush_ps:    parseInt(allocMatch[12], 10),
      };
      if (currentArena !== null && inArena) {
        result[currentArena][allocMatch[1]] = data;
      } else if (!inArena) {
        if (!result.global) result.global = { small: null, large: null, total: null };
        result.global[allocMatch[1]] = data;
      }
    }
  }
  return result;
}

// Bins Parser
//
// The hardest parser. Each bin row has 43 numeric fields.
// Format:
//   size ind allocated nmalloc nmalloc_ps ndalloc ndalloc_ps nrequests nrequests_ps
//   nshards curregs curslabs nonfull_slabs regs pgs util
//   nfills nfills_ps nflushes nflushes_ps nslabs nreslabs nreslabs_ps
//   pops pops_ps failed_push failed_push_ps push push_ps push_elem push_elem_ps
//   n_lock_ops n_lock_ops_ps n_waiting n_waiting_ps n_spin_acq n_spin_acq_ps
//   n_owner_switch n_owner_switch_ps total_wait_ns total_wait_ns_ps max_wait_ns max_n_thds
//
// The regex captures all 43 fields in one match.

export function parseArenaBins(text) {
  const lines = text.split('\n');
  const result = {};
  let currentArena = null;
  let inBins = false;
  let inArena = false;

  for (const line of lines) {
    const arenaMatch = line.match(/^arenas\[(\d+)\]:/);
    if (arenaMatch) {
      currentArena = parseInt(arenaMatch[1], 10);
      result[currentArena] = [];
      inBins = false;
      inArena = true;
      continue;
    }

    if (line.includes('bins:') && line.includes('size ind')) {
      inBins = true;
      continue;
    }

    if (inBins && line.trim()) {
      // End of bins section
      if (line.includes('large:') || line.includes('extents:') || line.match(/^[a-z]/)) {
        inBins = false;
        continue;
      }

      // 43-field regex. Each field is a number or decimal.
      const m = line.match(
        /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
      );
      if (!m) continue;

      const bin = {
        size:             parseInt(m[1], 10),
        ind:              parseInt(m[2], 10),
        allocated:        parseInt(m[3], 10),
        nmalloc:          parseInt(m[4], 10),
        nmalloc_ps:       parseInt(m[5], 10),
        ndalloc:          parseInt(m[6], 10),
        ndalloc_ps:       parseInt(m[7], 10),
        nrequests:        parseInt(m[8], 10),
        nrequests_ps:     parseInt(m[9], 10),
        nshards:          parseInt(m[10], 10),
        curregs:          parseInt(m[11], 10),
        curslabs:         parseInt(m[12], 10),
        nonfull_slabs:    parseInt(m[13], 10),
        regs:             parseInt(m[14], 10),
        pgs:              parseInt(m[15], 10),
        util:             parseFloat(m[16]),
        nfills:           parseInt(m[17], 10),
        nfills_ps:        parseInt(m[18], 10),
        nflushes:         parseInt(m[19], 10),
        nflushes_ps:      parseInt(m[20], 10),
        nslabs:           parseInt(m[21], 10),
        nreslabs:         parseInt(m[22], 10),
        nreslabs_ps:      parseInt(m[23], 10),
        pops:             parseInt(m[24], 10),
        pops_ps:          parseInt(m[25], 10),
        failed_push:      parseInt(m[26], 10),
        failed_push_ps:   parseInt(m[27], 10),
        push:             parseInt(m[28], 10),
        push_ps:          parseInt(m[29], 10),
        push_elem:        parseInt(m[30], 10),
        push_elem_ps:     parseInt(m[31], 10),
        n_lock_ops:       parseInt(m[32], 10),
        n_lock_ops_ps:    parseInt(m[33], 10),
        n_waiting:        parseInt(m[34], 10),
        n_waiting_ps:     parseInt(m[35], 10),
        n_spin_acq:       parseInt(m[36], 10),
        n_spin_acq_ps:    parseInt(m[37], 10),
        n_owner_switch:   parseInt(m[38], 10),
        n_owner_switch_ps:parseInt(m[39], 10),
        total_wait_ns:    parseInt(m[40], 10),
        total_wait_ns_ps: parseInt(m[41], 10),
        max_wait_ns:      parseInt(m[42], 10),
        max_n_thds:       parseInt(m[43], 10),
      };

      if (currentArena !== null && inArena) {
        result[currentArena].push(bin);
      } else if (!inArena) {
        if (!result.global) result.global = [];
        result.global.push(bin);
      }
    }
  }
  return result;
}

// Large Allocations Parser
//
// Format: size ind allocated nmalloc nmalloc_ps ndalloc ndalloc_ps
//         nrequests nrequests_ps curlextents

export function parseArenaLarge(text) {
  const lines = text.split('\n');
  const result = {};
  let currentArena = null;
  let inLarge = false;
  let inArena = false;

  for (const line of lines) {
    const arenaMatch = line.match(/^arenas\[(\d+)\]:/);
    if (arenaMatch) {
      currentArena = parseInt(arenaMatch[1], 10);
      result[currentArena] = [];
      inLarge = false;
      inArena = true;
      continue;
    }

    if (line.includes('large:') && line.includes('size ind')) {
      inLarge = true;
      continue;
    }

    if (inLarge && line.trim()) {
      if (line.includes('extents:') || line.match(/^[a-z]/)) {
        inLarge = false;
        continue;
      }

      const m = line.match(
        /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
      );
      if (!m) continue;

      const data = {
        size:         parseInt(m[1], 10),
        ind:          parseInt(m[2], 10),
        allocated:    parseInt(m[3], 10),
        nmalloc:      parseInt(m[4], 10),
        nmalloc_ps:   parseInt(m[5], 10),
        ndalloc:      parseInt(m[6], 10),
        ndalloc_ps:   parseInt(m[7], 10),
        nrequests:    parseInt(m[8], 10),
        nrequests_ps: parseInt(m[9], 10),
        curlextents:  parseInt(m[10], 10),
      };

      if (currentArena !== null && inArena) {
        result[currentArena].push(data);
      } else if (!inArena) {
        if (!result.global) result.global = [];
        result.global.push(data);
      }
    }
  }
  return result;
}

// Extents Parser
//
// Format: size ind ndirty dirty nmuzzy muzzy nretained retained ntotal total

export function parseArenaExtents(text) {
  const lines = text.split('\n');
  const result = {};
  let currentArena = null;
  let inExtents = false;
  let inArena = false;

  for (const line of lines) {
    const arenaMatch = line.match(/^arenas\[(\d+)\]:/);
    if (arenaMatch) {
      currentArena = parseInt(arenaMatch[1], 10);
      result[currentArena] = [];
      inExtents = false;
      inArena = true;
      continue;
    }

    if (line.includes('extents:') && line.includes('size ind')) {
      inExtents = true;
      continue;
    }

    if (inExtents && line.trim()) {
      if (line.match(/^[a-z]/) || line.match(/^arenas\[/)) {
        inExtents = false;
        continue;
      }

      const m = line.match(
        /^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
      );
      if (!m) continue;

      const data = {
        size:      parseInt(m[1], 10),
        ind:       parseInt(m[2], 10),
        ndirty:    parseInt(m[3], 10),
        dirty:     parseInt(m[4], 10),
        nmuzzy:    parseInt(m[5], 10),
        muzzy:     parseInt(m[6], 10),
        nretained: parseInt(m[7], 10),
        retained:  parseInt(m[8], 10),
        ntotal:    parseInt(m[9], 10),
        total:     parseInt(m[10], 10),
      };

      if (currentArena !== null && inArena) {
        result[currentArena].push(data);
      } else if (!inArena) {
        if (!result.global) result.global = [];
        result.global.push(data);
      }
    }
  }
  return result;
}

// Operations / Mutex Parser
//
// Extracts background thread info and mutex contention stats.
// Background thread line:
//   "Background threads: 1, num_runs: 1234, run_interval: 1000000000 ns"
// Mutex lines:
//   "mutex_name  n_lock_ops  ps  n_waiting  ps  n_spin_acq  ps
//    n_owner_switch  ps  total_wait_ns  ps  max_wait_ns  max_n_thds"

const KNOWN_MUTEXES = new Set([
  'background_thread', 'max_per_bg_thd', 'ctl', 'prof',
  'prof_thds_data', 'prof_dump', 'prof_recent_alloc',
  'prof_recent_dump', 'prof_stats',
]);

export function parseOperations(text) {
  const lines = text.split('\n');
  const ops = {
    backgroundThreads: null,
    numRuns: null,
    runInterval: null,
    mutexStats: [],
  };

  for (const line of lines) {
    if (line.includes('Background threads:')) {
      const m = line.match(/Background threads:\s*(\d+),\s*num_runs:\s*(\d+),\s*run_interval:\s*(\d+)\s*ns/);
      if (m) {
        ops.backgroundThreads = parseInt(m[1], 10);
        ops.numRuns = parseInt(m[2], 10);
        ops.runInterval = parseInt(m[3], 10);
      }
    }

    // Mutex stats: name followed by 13 numbers
    const m = line.match(
      /^\s*(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/
    );
    if (m && !line.includes('n_lock_ops') && KNOWN_MUTEXES.has(m[1])) {
      ops.mutexStats.push({
        name:               m[1],
        n_lock_ops:         parseInt(m[2], 10),
        n_lock_ops_ps:      parseInt(m[3], 10),
        n_waiting:          parseInt(m[4], 10),
        n_waiting_ps:       parseInt(m[5], 10),
        n_spin_acq:         parseInt(m[6], 10),
        n_spin_acq_ps:      parseInt(m[7], 10),
        n_owner_switch:     parseInt(m[8], 10),
        n_owner_switch_ps:  parseInt(m[9], 10),
        total_wait_ns:      parseInt(m[10], 10),
        total_wait_ns_ps:   parseInt(m[11], 10),
        max_wait_ns:        parseInt(m[12], 10),
        max_n_thds:         parseInt(m[13], 10),
      });
    }
  }

  return ops;
}

// Normalize Raw Text
//
// system.jemalloc_stats returns the text with literal \n escape sequences.
// This converts them to actual newlines.

export function normalizeStatsText(rawText) {
  if (!rawText) return '';
  return rawText.replace(/\\n/g, '\n');
}

// Threshold Helpers
//
// Used by the component to determine card border color.

export function fragStatus(pct) {
  if (pct > 25) return 'critical';
  if (pct > 15) return 'warning';
  return 'normal';
}

export function efficiencyStatus(pct) {
  if (pct < 75) return 'critical';
  if (pct < 85) return 'warning';
  return 'normal';
}

// Has Contention
//
// Returns true if any mutex shows non-zero spin acquisitions or waiting.
// Used to conditionally show the Lock Contention section.

export function hasContention(mutexStats) {
  return mutexStats.some(m => m.n_spin_acq > 0 || m.n_waiting > 0 || m.total_wait_ns > 0);
}