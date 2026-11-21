// StepSource.jsx - Step 1: choose a data source
//
// The user uploads a file (primary) or gives an object-storage reference. For
// binary formats (Parquet, ORC) the whole file is sent because the schema lives
// in the footer; for text formats a leading sample is enough. The server reads
// the source and returns the inferred columns and per-column statistics.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail Data Private Limited

import { useState, useRef } from "react";
import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import { inferFromFile, inferFromObject } from "../../utils/studioApi.js";
import { Input, Button, Notice } from "../ui/index.jsx";

// Leading bytes sent for text formats (a sample is enough to infer + estimate).
const TEXT_SAMPLE_BYTES = 2 * 1024 * 1024;

export default function StepSource({ onDone }) {
  const [mode, setMode] = useState("upload"); // upload | object
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const fileRef = useRef(null);

  const [obj, setObj] = useState({
    provider: "s3",
    path: "",
    accessKeyId: "",
    secretAccessKey: "",
    connectionString: "",
    container: "",
    format: "Parquet",
  });

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const name = file.name || "";
      const isBinary = /\.(parquet|orc)$/i.test(name);
      const payload = isBinary ? file : file.slice(0, TEXT_SAMPLE_BYTES);
      const res = await inferFromFile(payload, name);

      if (res?.error) {
        if (res?.type === 'POCO') {
          setWarning({type:res.type,message:res?.error})
          return;
        }else if (res?.type === "URI LONG") {
          setWarning({type:res.type,message:res?.error})
          return;
        }else {
          setError(res?.error)
          return 
        }
       
      }

      onDone(res);
      return;
    } catch (e) {
      
      setError(e.message);
      return
    } finally {
      setBusy(false);
    }
  }

  async function handleObject() {
    setBusy(true);
    setError(null);
    try {
      const res = await inferFromObject(obj);
      onDone(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-step-pane">
      <div className="studio-segment">
        <button
          className={"studio-seg-btn" + (mode === "upload" ? " active" : "")}
          onClick={() => setMode("upload")}
        >
          Upload a file
        </button>
        <button
          className={"studio-seg-btn" + (mode === "object" ? " active" : "")}
          onClick={() => setMode("object")}
        >
          Object storage
        </button>
      </div>

      {error && (
        <Notice tone="danger" icon="ti-alert-circle" style={{ marginTop: 12 }}><span>{error}</span></Notice>
      )}

      {warning?.type === "POCO" && (
        <Notice tone="danger" style={{display:"flex",margin:"10px 0px",alignItems:"start",flexDirection:"column"}}>
          <div style={{display:"flex",gap:"10px"}}>
            <Icon className="ti ti-alert-circle" />
            <h5>HTTP Field Size Warning</h5>
          </div>

          <div>
            <h5 style={{fontSize:"0.75rem"}}>
              <strong>Warning:</strong> HTTP request field value exceeds the
              configured limit.
            </h5>

            <p style={{fontSize:"0.75rem"}}>
              The submitted field value is too large for ClickHouse to process.
            </p>

            <p style={{fontSize:"0.75rem"}}>
              Please increase the http_max_field_value_size setting in the
              ClickHouse server configuration and restart ClickHouse.
            </p>

            <h5 style={{fontSize:"0.75rem"}}>
              <strong>Current error:</strong>
            </h5>
            <code style={{fontSize:"0.75rem"}}>{warning?.message}</code>
          </div>
        </Notice>
      )}

      {warning?.type === "URI LONG" && (
        <Notice tone="danger" style={{display:"flex",margin:"10px 0px",alignItems:"start",flexDirection:"column"}}>
          <div style={{display:"flex",gap:"10px"}}>
            <Icon className="ti ti-alert-circle" />
            <h5>HTTP URI Size Warning</h5>
          </div>

          <div>
            <h5 style={{fontSize:"0.75rem"}}>
              <strong>Warning:</strong> HTTP request URI is invalid or too long.
            </h5>

            <p style={{fontSize:"0.75rem"}}>
             The request URL exceeds the configured size limit for ClickHouse.


            </p>

            <p style={{fontSize:"0.75rem"}}>
             Please increase the http_max_uri_size setting in the ClickHouse server configuration and restart ClickHouse.
            </p>

            <h5 style={{fontSize:"0.75rem"}}>
              <strong>Current error:</strong>
            </h5>
            <code style={{fontSize:"0.75rem"}}>{warning?.message}</code>
          </div>
        </Notice>
      )}

      {mode === "upload" ? (
        <div
          className="studio-dropzone"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".csv,.tsv,.json,.ndjson,.jsonl,.parquet,.orc"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {busy ? (
            <>
              <span className="loading-spinner"></span> Inferring schema...
            </>
          ) : (
            <>
              <Icon
                className="ti ti-upload"
                style={{ fontSize: "2rem", opacity: 0.6 }}
              />
              <div className="studio-dropzone-title">
                Drop a file here, or click to choose
              </div>
              <div className="studio-dropzone-sub">
                CSV (with header), TSV (with header), JSON, NDJSON, Parquet, ORC
              </div>
              {/* <div className="studio-dropzone-sub">Maximum Supported Rows: 1000</div> */}
            </>
          )}
        </div>
      ) : (
        <div className="studio-objform">
          <div className="studio-segment">
            <button
              className={
                "studio-seg-btn" + (obj.provider === "s3" ? " active" : "")
              }
              onClick={() => setObj({ ...obj, provider: "s3" })}
            >
              S3
            </button>
            <button
              className={
                "studio-seg-btn" + (obj.provider === "azure" ? " active" : "")
              }
              onClick={() => setObj({ ...obj, provider: "azure" })}
            >
              Azure
            </button>
          </div>

          {obj.provider === "s3" ? (
            <>
              <Input
                placeholder="S3 URL (https://bucket.s3.../file.parquet)"
                value={obj.path}
                onChange={(e) => setObj({ ...obj, path: e.target.value })}
              />
              <Input
                placeholder="Access key ID"
                value={obj.accessKeyId}
                onChange={(e) =>
                  setObj({ ...obj, accessKeyId: e.target.value })
                }
              />
              <Input
                type="password"
                placeholder="Secret access key"
                value={obj.secretAccessKey}
                onChange={(e) =>
                  setObj({ ...obj, secretAccessKey: e.target.value })
                }
              />
            </>
          ) : (
            <>
              <Input
                type="password"
                placeholder="Azure connection string"
                value={obj.connectionString}
                onChange={(e) =>
                  setObj({ ...obj, connectionString: e.target.value })
                }
              />
              <Input
                placeholder="Container"
                value={obj.container}
                onChange={(e) => setObj({ ...obj, container: e.target.value })}
              />
              <Input
                placeholder="Blob path (file.parquet)"
                value={obj.path}
                onChange={(e) => setObj({ ...obj, path: e.target.value })}
              />
            </>
          )}

          <Select
            className="form-select"
            value={obj.format}
            onChange={(e) => setObj({ ...obj, format: e.target.value })}
          >
            <option value="Parquet">Parquet</option>
            <option value="ORC">ORC</option>
            <option value="CSVWithNames">CSV (with header)</option>
            <option value="TSVWithNames">TSV (with header)</option>
            <option value="JSONEachRow">JSON / NDJSON</option>
          </Select>

          <Button
            variant="primary"
            onClick={handleObject}
            disabled={busy || !obj.path}
          >
            {busy ? "Inferring..." : "Infer schema"}
          </Button>
        </div>
      )}

      <p className="studio-note">
        ClickHouse reads a sample to infer the schema. Object-storage keys are
        used only for this read and are not stored.
      </p>
    </div>
  );
}
