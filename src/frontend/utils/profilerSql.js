// profilerSql.js - SQL for the Query Profiler: the query list and the flame graph.
// Copyright (C) 2026 Quantrail Data Private Limited

// "2026-05-26T10:00" (a datetime-local value) -> "2026-05-26 10:00:00".
// A value that has seconds keeps them.
export function toChDatetime(value) {
  const text = value.replace("T", " ");
  return /\d{2}:\d{2}:\d{2}$/.test(text) ? text : text + ":00";
}

// Puts a value in single quotes for ClickHouse SQL.
export function sqlText(value) {
  return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

// The memory_context column applies only to these trace types.
export function supportsMemoryContext(traceType) {
  return traceType === "Memory" || traceType === "MemoryPeak";
}

export function buildQueryListSql(from, to, traceType) {
  const chFrom = toChDatetime(from);
  const chTo = toChDatetime(to);
  const traceFilter = traceType ? `\n  AND t.trace_type = ${sqlText(traceType)}` : "";

  return `
SELECT
  t.query_id,
  min(t.event_time) AS first_seen,
  count() AS sample_count,
  substring(coalesce(q.query, ''), 1, 300) AS query_preview,
  q.query_duration_ms
FROM system.trace_log AS t
JOIN (
  SELECT query_id, query, query_duration_ms
  FROM system.query_log
  WHERE type = 'QueryFinish'
    AND event_date >= toDate(${sqlText(chFrom)}) - 1
  ORDER BY event_time DESC
  LIMIT 1 BY query_id
) AS q USING (query_id)
WHERE t.query_id != ''
  AND t.event_time >= ${sqlText(chFrom)}
  AND t.event_time <= ${sqlText(chTo)}${traceFilter}
GROUP BY t.query_id, q.query, q.query_duration_ms
ORDER BY first_seen DESC
LIMIT 500`.trim();
}

// The flame graph uses the same time range, trace type and memory context as the page shows.
export function buildFlameGraphSql({ traceType, queryId, from, to, memoryContext }) {
  const chFrom = toChDatetime(from);
  const chTo = toChDatetime(to);
  const traceFilter = traceType ? `\n  AND trace_type = ${sqlText(traceType)}` : "";
  const contextFilter =
    memoryContext && supportsMemoryContext(traceType)
      ? `\n  AND memory_context = ${sqlText(memoryContext)}`
      : "";

  return `
SELECT
  arrayStringConcat(
    arrayReverse(arrayMap(x -> demangle(addressToSymbol(x)), trace)),
    ';'
  ) AS stack,
  count() AS samples
FROM system.trace_log
WHERE query_id = ${sqlText(queryId)}
  AND event_date >= toDate(${sqlText(chFrom)})
  AND event_time >= ${sqlText(chFrom)}
  AND event_time <= ${sqlText(chTo)}${traceFilter}${contextFilter}
GROUP BY stack`.trim();
}
