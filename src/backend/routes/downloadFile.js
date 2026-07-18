// downloadFile.js - Data export REST API
//
// POST /multiple/file exports query results as CSV or JSON files.
// Accepts data, table name, and file type. Used by the SQL editor
// and query results tables to download data. Files are sent as
// attachments with proper content-type headers.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Router } from "express";

const router = Router();

router.post("/multiple/file", async (req, res) => {
  try {
    const { data, tablename, type } = req.body;
    // console.log(req?.body)
    if (!type) {
      return res.json({ success: false, message: "mention the file type!" });
    }
    if (type === "json") {
      const json = JSON.stringify(data);
      res.attachment(`${tablename}.json`);
      res.send(json);
      return;
    }
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((obj) => Object.values(obj).join(",")).join("\n");
    const csvContent = `${headers}\n${rows}`;
    res.attachment(`${tablename}.csv`);
    res.type("text/csv");

    res.send(csvContent);
    return;
  } catch (error) {
    console.error("Error on downloading the multifile :", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to download",
      error: error.message,
    });
  }
});


export default router
