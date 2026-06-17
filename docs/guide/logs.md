# Logs

CHOps provides three log viewers: Crash Log, Error Log, and Text Log. Each has two tabs: **Overview** (calendar heatmap) and **Search** (filterable log viewer with mandatory time range and optional filters, plus a configurable row limit).

## Overview Tab (all log pages)

Each log page has an Overview tab with a calendar heatmap showing event frequency by date and hour. Select a time range (1h, 6h, 24h, 48h, 7d, 30d) and click Load Heatmap. The heatmap uses a 1000-step amber/orange color scale (same on both themes). Even the smallest non-zero values show a faint warm tint. The color depth automatically adapts to data variance - uniform data uses lighter shades, high-variance data uses the full range from light to deep brown. Download and fullscreen buttons sit above the chart. The chart re-renders automatically when you toggle the theme. Error Log and Text Log additionally offer filter dropdowns (error type or log level) on the Overview tab.

## Crash Log

**Search tab fields:** Start Time (mandatory), End Time (mandatory), Query (free text), Signal Description (free text), Exception Trace (free text)

**Generated query:**
```sql
SELECT timestamp_ns, signal, signal_code, query_id, query, signal_description, current_exception_trace_full
FROM system.crash_log
WHERE event_time BETWEEN {start} AND {end}
  AND query LIKE '%{query text}%'
  AND signal_description LIKE '%{signal desc}%'
  AND arrayExists(x -> ilike(x, '%{trace text}%'), current_exception_trace)
ORDER BY event_time DESC LIMIT {row_limit}
```

## Error Log

**Search tab fields:** Start Time (mandatory), End Time (mandatory), Error Type (multi-select, dynamically populated from `SELECT DISTINCT error FROM system.error_log`), Error Message (free text)

**Generated query:**
```sql
SELECT event_time, error, last_error_message, last_error_query_id
FROM system.error_log
WHERE event_time BETWEEN {start} AND {end}
  AND last_error_message LIKE '%{message}%'
  AND error IN ({selected errors})
ORDER BY event_time DESC LIMIT {row_limit}
```

## Text Log

**Search tab fields:** Start Time (mandatory), End Time (mandatory), Log Level (multi-select: Fatal, Critical, Error, Warning, Notice, Information, Debug, Trace, Test), Message (free text)

**Generated query:**
```sql
SELECT event_time_microseconds, level, query_id, logger_name, message, source_file, source_line
FROM system.text_log
WHERE event_time BETWEEN {start} AND {end}
  AND level IN ({selected levels})
  AND message LIKE '%{message}%'
ORDER BY event_time DESC LIMIT {row_limit}
```

**Dark mode row colors by level:**

| Level | Text Color | Background |
|-------|-----------|------------|
| Test | #86efac | #0a1f0a |
| Trace | #6ee7b7 | #081208 |
| Debug | #93c5fd | #0D161C |
| Information | #60a5fa | #070D14 |
| Notice | #fde68a | #1F1A0D |
| Warning | #fdba74 | #1A0F00 |
| Error | #fca5a5 | #1A0A05 |
| Critical | #f87171 | #1a0505 |
| Fatal | #fb7185 | #1a0000 |

Light mode uses darker text on lighter backgrounds (e.g., Trace: #2E7D32 on #e8f5e9).

All three log sections include a Row Limit field (default 500) that controls the LIMIT clause.
