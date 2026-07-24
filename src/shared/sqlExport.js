// sqlExport.js - SQL preparation helpers shared by the export wizard.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G


import { analyzeSql, leadingKeyword } from "./sqlClassify.js";


export function normalizeForExport(sql) {
  const parsed = analyzeSql(sql || "");
  const first = (parsed.statements[0]?.text || "").trim();
  return first.replace(/\s+FORMAT\s+[A-Za-z0-9_]+\s*$/i, "").trim();
}


export function isSelectLike(sql) {
  const keyword = leadingKeyword(normalizeForExport(sql));
  return keyword === "SELECT" || keyword === "WITH";
}


export function hasMultipleStatements(sql) {
  return analyzeSql(sql || "").multiple;
}


export function wrapForCount(sql) {
  return `SELECT count() AS c FROM (\n${normalizeForExport(sql)}\n)`;
}


export function wrapForSample(sql, limit) {
  const n = Number(limit) > 0 ? Math.floor(Number(limit)) : 10000;
  return `SELECT * FROM (\n${normalizeForExport(sql)}\n) LIMIT ${n}`;
}