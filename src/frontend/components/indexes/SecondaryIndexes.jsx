// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Configures data-skipping indexes (e.g., MinMax, Bloom filters) to bypass irrelevant blocks during queries.

import { useEffect, useMemo, useState } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { FormField } from "../ui/index.jsx";
import TreeGraph from "../common/TreeGraph.jsx";
import { buildIndexTree } from "../../utils/schemaTrees.js";

export default function SecondaryIndexes() {
  const [db, setDb] = useState("");
  const [tbl, setTbl] = useState("");
  const dbsQ = useQuery(),
    tblsQ = useQuery(),
    idxQ = useQuery();

  useEffect(() => {
    dbsQ.execute(
      "SELECT DISTINCT database FROM system.data_skipping_indices ORDER BY database",
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, []);
  useEffect(() => {
    if (db)
      tblsQ.execute(
        `SELECT DISTINCT table FROM system.data_skipping_indices WHERE database='${db}' ORDER BY table`,
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [db]);
  useEffect(() => {
    if (db) {
      const w = tbl ? ` AND table='${tbl}'` : "";
      idxQ.execute(
        `SELECT database, table, name, type_full, granularity, expr FROM system.data_skipping_indices WHERE database='${db}'${w} ORDER BY table, name`,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [db, tbl]);

  const tree = useMemo(() => buildIndexTree(db, idxQ.data), [db, idxQ.data]);
  if (dbsQ.loading && !dbsQ.data)
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-list-tree"></Icon> Data Skipping Indexes
        </h2>
      </div>
      <div className="card search-form-row" style={{ padding: 16, marginBottom: 20 }}>
        <FormField label="Database" className="search-field">
          <Select
            className="form-select"
            value={db}
            onChange={(e) => {
              setDb(e.target.value);
              setTbl("");
            }}
          >
            <option value="">-- select --</option>
            {dbsQ.data?.map((r) => (
              <option key={r.database}>{r.database}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Table" className="search-field">
          <Select
            className="form-select"
            value={tbl}
            onChange={(e) => setTbl(e.target.value)}
          >
            <option value="">All</option>
            {tblsQ.data?.map((r) => (
              <option key={r.table}>{r.table}</option>
            ))}
          </Select>
        </FormField>
      </div>
      {tree ? (
        <TreeGraph tree={tree} fileName="indexes-tree.png" emptyMessage="No indexes found." />
      ) : (
        <div className="empty-state" style={{height:"50vh" }}>
          <Icon className="ti ti-list-tree"></Icon>
          <p>
            {db ? "No indexes found." : "Select a database to view indexes."}
          </p>
        </div>
      )}
    </div>
  );
}
