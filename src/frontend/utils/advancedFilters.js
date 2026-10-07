// advancedFilters.js - Helper functions for the log search advanced filters.
// Copyright (C) 2026 Quantrail Data Private Limited
export const MAX_FILTERS = 10;
function storageKey(tableName) {
    return `chops_logs_adv_${tableName}`;
}
// Clean a filter list into rows of { op: "AND" or "OR", expr: string }.
// Rows past the MAX_FILTERS cap are dropped.
export function normalizeFilters(filters) {
    const inputRows = Array.isArray(filters) ? filters : [];
    const cleanRows = [];
    for (const row of inputRows) {
        if (cleanRows.length >= MAX_FILTERS) break;
        cleanRows.push({
            op: row && row.op === "OR" ? "OR" : "AND",
            expr: row && typeof row.expr === "string" ? row.expr : "",
        });
    }
    return cleanRows;
}
// Only the filter rows where the user typed something.
export function activeFilters(filters) {
    const cleanRows = normalizeFilters(filters);
    return cleanRows.filter((row) => row.expr.trim().length > 0);
}
// Join the base conditions with AND, then add the custom rows as one group.
// Example: base1 AND base2 AND ((f1) OR (f2) AND (f3)). See spec D2.
export function buildWhere(baseConditions, filters) {
    const conditions = (baseConditions || []).filter(Boolean);
    const typedFilters = activeFilters(filters);
    let whereText = conditions.join(" AND ");
    if (typedFilters.length > 0) {
        let customChain = "";
        for (let i = 0; i < typedFilters.length; i++) {
            const row = typedFilters[i];
            if (i === 0) {
                // The first row joins with AND, so its own op is not used.
                customChain = `(${row.expr.trim()})`;
            } else {
                customChain = `${customChain} ${row.op} (${row.expr.trim()})`;
            }
        }
        if (whereText) {
            whereText = `${whereText} AND (${customChain})`;
        } else {
            whereText = `(${customChain})`;
        }
    }
    return whereText;
}
// Picked columns not already in the fixed set, in pick order, no duplicates.
export function extraColumns(fixedColumnNames, pickedColumnNames) {
    const alreadyUsed = new Set();
    for (const name of fixedColumnNames || []) {
        alreadyUsed.add(String(name));
    }
    const result = [];
    for (const name of pickedColumnNames || []) {
        if (!name) continue;
        if (alreadyUsed.has(name)) continue;
        alreadyUsed.add(name);
        result.push(name);
    }
    return result;
}
// SELECT text to append: ", `col1`, `col2`" or "". Names come from
// system.columns, so backtick quoting is enough.
export function extraSelectSql(fixedColumnNames, pickedColumnNames) {
    const extras = extraColumns(fixedColumnNames, pickedColumnNames);
    if (extras.length === 0) return "";
    const quotedNames = extras.map((name) => {
        const safeName = String(name).replaceAll("`", "");
        return "`" + safeName + "`";
    });
    return ", " + quotedNames.join(", ");
}
// Load the saved selection for one table. Bad or old data gives the
// empty selection. Never throws.
export function loadAdvState(tableName) {
    const emptyState = { columns: [], filters: [] };
    try {
        const storedText = localStorage.getItem(storageKey(tableName));
        if (!storedText) return emptyState;
        const parsed = JSON.parse(storedText);
        if (!parsed || parsed.v !== 1) return emptyState;
        const columns = [];
        if (Array.isArray(parsed.columns)) {
            for (const name of parsed.columns) {
                if (typeof name === "string" && name) columns.push(name);
            }
        }
        return { columns, filters: normalizeFilters(parsed.filters) };
    } catch {
        return emptyState;
    }
}
// Save the selection for one table to localStorage.
export function saveAdvState(tableName, state) {
    try {
        const toStore = {
            v: 1,
            columns: Array.isArray(state && state.columns) ? state.columns : [],
            filters: normalizeFilters(state && state.filters),
        };
        localStorage.setItem(storageKey(tableName), JSON.stringify(toStore));
    } catch {
        // Storage can be blocked. The selection is then forgotten on reload.
    }
}