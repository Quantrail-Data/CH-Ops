// ExportWizard - Three step export dialog for the SQL Editor.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";
import { useToast } from "../layout/Toast.jsx";
import {
  FORMATS, FORMAT_GROUPS, COMPRESSIONS, SELF_COMPRESSED,
  findFormat, findCompression, optionsForFormat,
} from "../../../shared/exportFormats.js";
import { isSelectLike, hasMultipleStatements } from "../../../shared/sqlExport.js";
import {
  estimateExport, startExport, exportProgress, cancelExport, downloadExport,
  formatBytes, formatRows,
} from "../../utils/exportApi.js";
import { beginBusy, endBusy } from "../../hooks/useIdleTimeout.js";

function defaultFileName(username) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const who = String(username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "user";
  return `${who}-export-${stamp}`;
}

export default function ExportWizard({ sql, username, onClose }) {
  const toast = useToast();
  const [step, setStep] = useState(1);

  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [tried, setTried] = useState(false);

  const [format, setFormat] = useState("CSVWithNames");
  const [compression, setCompression] = useState("zip");
  const [fileName, setFileName] = useState(() => defaultFileName(username));
  const [bom, setBom] = useState(true);
  const [settings, setSettings] = useState({});
  const [advOpen, setAdvOpen] = useState(false);

  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  const selectLike = useMemo(() => isSelectLike(sql), [sql]);
  const multiple = useMemo(() => hasMultipleStatements(sql), [sql]);
  const fmt = findFormat(format);
  const comp = findCompression(compression);
  const advanced = useMemo(() => optionsForFormat(format), [format]);
  const isText = !!fmt?.text;


  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });


  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      endBusy();
    };
  }, []);

  async function runEstimate() {
    setEstimating(true);
    try {
      const result = await estimateExport({ sql, format, settings });
      setEstimate(result);
    } catch (err) {
      setEstimate(null);
      toast.error(err.message || "Could not estimate this query.");
    } finally {
      setEstimating(false);
      setTried(true);
    }
  }

  function goToStep2() {
    if (estimate?.bytes && estimate.bytes > (estimate.warnBytes || 0)) {
      const ok = window.confirm(
        `This export is about ${formatBytes(estimate.bytes)} before compression. ` +
        "It may take a long time and use a lot of disk space. Continue?",
      );
      if (!ok) return;
    }
    setStep(2);
  }

  async function begin() {
    try {
      const started = await startExport({
        sql,
        format,
        compression,
        filename: fileName,
        bom: isText && bom,
        settings,
        estimatedBytes: estimate?.bytes || 0,
      });
      setJob(started);
      setStep(3);
      beginBusy();
      pollRef.current = setInterval(async () => {
        try {
          const p = await exportProgress(started.jobId);
          setProgress(p);
          if (p.state !== "running") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            endBusy();
          }
        } catch {
          clearInterval(pollRef.current);
          pollRef.current = null;
          endBusy();
        }
      }, 1000);
    } catch (err) {
      toast.error(err.message || "Could not start the export.");
    }
  }

  async function handleClose() {
    if (job && progress?.state === "running") {
      const stop = window.confirm(
        "This export is still running. Press OK to cancel it, or Cancel to leave it running in the background.",
      );
      if (stop) {
        try { await cancelExport(job.jobId); } catch {  }
      }
    } else if (job) {
      try { await cancelExport(job.jobId); } catch {  }
    }
    if (pollRef.current) clearInterval(pollRef.current);
    endBusy();
    onClose();
  }

  function setOption(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function resetOptions() {
    setSettings({});
  }

  const percent = progress?.percent;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box xw-box" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>
          <Icon className="ti ti-download" /> Export query results
        </h3>

        <div className="xw-steps">
          <span className={`xw-step ${step === 1 ? "active" : ""}`}>1. Query</span>
          <span className={`xw-step ${step === 2 ? "active" : ""}`}>2. Format</span>
          <span className={`xw-step ${step === 3 ? "active" : ""}`}>3. Download</span>
        </div>

        {step === 1 && (
          <div>
            <div className="xw-label">This SQL will be exported</div>
            <div className="xw-sql">{sql}</div>

            {!selectLike && (
              <div className="xw-note xw-warn" style={{ marginTop: 12 }}>
                This does not look like a SELECT query. The size cannot be estimated,
                and the export may not produce what you expect. Continue only if you
                are sure.
              </div>
            )}
            {multiple && (
              <div className="xw-note" style={{ marginTop: 12 }}>
                The editor holds more than one statement. Only the first one is exported.
              </div>
            )}
            <div className="xw-note" style={{ marginTop: 12 }}>
              The export runs this SQL again on the server, so it always returns the
              full result. If you have not run it yet, consider running it once first
              to check it does what you expect.
            </div>

            {estimate && (
              <div className="xw-note" style={{ marginTop: 12 }}>
                {estimate.rows === null ? (
                  <>The size of this query could not be estimated.</>
                ) : (
                  <>
                    About <strong>{formatRows(estimate.rows)}</strong> rows
                    {estimate.bytes ? (
                      <> and roughly <strong>{formatBytes(estimate.bytes)}</strong> before compression</>
                    ) : null}
                    . {estimate.exact ? "This is an exact count." : "This is an estimate based on rows scanned, so it can be much higher than the number returned."}
                    {" "}The final file size depends on the compression you choose and cannot be predicted.
                  </>
                )}
              </div>
            )}

            <div className="xw-actions">
              <button className="btn btn-secondary" onClick={handleClose}>Close</button>
              <button className="btn btn-secondary" onClick={runEstimate} disabled={estimating}>
                {estimating ? <span className="loading-spinner" /> : <Icon className="ti ti-ruler" />}
                {" "}Estimate rows
              </button>
              <button className="btn btn-primary" onClick={goToStep2} disabled={!tried}>
                Next
              </button>
            </div>
            {!tried && (
              <div className="xw-help" style={{ textAlign: "right" }}>
                Run the estimate once before continuing.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="xw-row">
              <div className="xw-field">
                <label className="xw-label">Format</label>
                <select
                  className="form-select"
                  value={format}
                  onChange={(e) => { setFormat(e.target.value); setSettings({}); }}
                  style={{ width: "100%" }}
                >
                  {FORMAT_GROUPS.map((group) => (
                    <optgroup key={group} label={group}>
                      {FORMATS.filter((f) => f.group === group).map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="xw-field">
                <label className="xw-label">Compression</label>
                <select
                  className="form-select"
                  value={compression}
                  onChange={(e) => setCompression(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {COMPRESSIONS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="xw-row">
              <div className="xw-field" style={{ flex: "1 1 100%" }}>
                <label className="xw-label">File name</label>
                <span style={{ display: "flex", alignItems: "center" }}>
                  <input
                    className="form-input"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <span className="xw-ext">.{fmt?.ext}{comp?.ext}</span>
                </span>
                <div className="xw-help">The ending is added for you.</div>
              </div>
            </div>

            {isText && (
              <div className="xw-row">
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={bom} onChange={(e) => setBom(e.target.checked)} />
                  Add a byte order mark so Excel on Windows reads accents correctly
                </label>
              </div>
            )}

            {SELF_COMPRESSED.includes(format) && compression !== "none" && (
              <div className="xw-note">
                {fmt.label} files already compress their own contents, so adding
                {" "}{comp.label} on top saves very little.
              </div>
            )}

            <div className="xw-adv">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setAdvOpen(!advOpen)}
              >
                <Icon className={`ti ti-chevron-${advOpen ? "down" : "right"}`} />
                {" "}Advanced options
              </button>

              {advOpen && (
                <div style={{ marginTop: 10 }}>
                  {advanced.length === 0 && (
                    <div className="xw-help">This format has no extra options.</div>
                  )}
                  {advanced.map((opt) => (
                    <div key={opt.key} className="xw-field" style={{ marginBottom: 10 }}>
                      <label className="xw-label">{opt.label}</label>
                      {opt.type === "bool" && (
                        <input
                          type="checkbox"
                          checked={settings[opt.key] !== undefined ? settings[opt.key] === 1 : opt.def}
                          onChange={(e) => setOption(opt.key, e.target.checked ? 1 : 0)}
                        />
                      )}
                      {opt.type === "select" && (
                        <select
                          className="form-select"
                          value={settings[opt.key] ?? opt.def}
                          onChange={(e) => setOption(opt.key, e.target.value)}
                        >
                          {opt.choices.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      )}
                      {opt.type === "text" && (
                        <input
                          className="form-input"
                          value={settings[opt.key] ?? opt.def}
                          onChange={(e) => setOption(opt.key, e.target.value)}
                        />
                      )}
                      {opt.type === "number" && (
                        <input
                          className="form-input"
                          type="number"
                          value={settings[opt.key] ?? opt.def}
                          onChange={(e) => setOption(opt.key, Number(e.target.value))}
                        />
                      )}
                      {opt.help && <div className="xw-help">{opt.help}</div>}
                    </div>
                  ))}
                  {advanced.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={resetOptions}>
                      Reset to defaults
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="xw-actions">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-secondary" onClick={handleClose}>Close</button>
              <button className="btn btn-primary" onClick={begin} disabled={!fileName.trim()}>
                Start export
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="xw-label">
              {progress?.state === "ready"
                ? "Your file is ready"
                : progress?.state === "failed"
                  ? "The export failed"
                  : "Preparing your file"}
            </div>

            <div className="xw-bar">
              <span style={{ width: `${progress?.state === "ready" ? 100 : percent || 3}%` }} />
            </div>
            <div className="xw-help">
              {progress?.state === "running" && (
                <>Running the query and compressing, {formatBytes(progress.bytesRead)} so far
                  {percent ? ` (about ${percent}%)` : ""}.</>
              )}
              {progress?.state === "ready" && (
                <>{progress.fileName}, {formatBytes(progress.bytesWritten)}.</>
              )}
              {progress?.state === "failed" && <>{progress.error}</>}
              {!progress && <>Starting.</>}
            </div>

            {progress?.state === "ready" && (
              <div className="xw-note" style={{ marginTop: 12 }}>
                Once the download starts, your browser takes over. Closing this window
                after that removes the copy on the server but does not stop the download.
              </div>
            )}

            <div className="xw-actions">
              {progress?.state === "running" && (
                <button className="btn btn-secondary" onClick={onClose}>
                  Run in background
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleClose}>
                {progress?.state === "running" ? "Cancel export" : "Close"}
              </button>
              {progress?.state === "ready" && (
                <button className="btn btn-primary" onClick={() => downloadExport(job.jobId)}>
                  <Icon className="ti ti-download" /> Download
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
