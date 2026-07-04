// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Custom React hook for fetching database query results, managing caching, and tracking loading states.

import { useState, useCallback } from 'react';
import { runQuery } from '../utils/api.js';

export function useQuery() {
  const [data, setData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (sql) => {
    setLoading(true); setError(null);
    try {
      const res = await runQuery(sql);
      setData(res.rows || []);
      setColumns(res.columns || []);
    } catch (err) {
      setError(err.message);
      setData(null);
    }
    setLoading(false);
  }, []);

  return { data, columns, loading, error, execute };
}
