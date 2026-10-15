// useTableColumns.js - Column list of one system log table, cached per session.
// Copyright (C) 2026 Quantrail Data Private Limited
import { useEffect, useState } from "react";
import { runQuery } from "../utils/api.js";
import { useConnection } from "../App.jsx";
const columnCache = new Map();
export function useTableColumns(tableName) {
    const { selectedClusterId, nodeName } = useConnection();
    const cacheKey = `${selectedClusterId}|${nodeName}|${tableName}`;
    const [state, setState] = useState(() => {
        const cached = columnCache.get(cacheKey);
        if (cached) return cached;
        return { columns: [], loading: true, error: null, absent: false };
    });
    useEffect(() => {
        let cancelled = false;
        const cached = columnCache.get(cacheKey);
        if (cached) {
            setState(cached);
            return undefined;
        }
        setState({ columns: [], loading: true, error: null, absent: false });
        // tableName is a code constant like 'text_log', never user input.
        runQuery(
            `SELECT name, type FROM system.columns WHERE database = 'system' AND
table = '${tableName}' ORDER BY position`,
            { readOnly: true },
        )
            .then((res) => {
                const columns = (res.rows || []).filter((row) => row && row.name);
                const result = {
                    columns,
                    loading: false,
                    error: null,
                    absent: columns.length === 0,
                };
                columnCache.set(cacheKey, result);
                if (!cancelled) setState(result);
            })
            .catch((err) => {
                // Errors are not cached, so the next mount retries.
                const result = {
                    columns: [], loading: false, error: err.message,
                    absent: false
                };
                if (!cancelled) setState(result);
            });
        return () => {
            cancelled = true;
        };
    }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps
    return state;
}
