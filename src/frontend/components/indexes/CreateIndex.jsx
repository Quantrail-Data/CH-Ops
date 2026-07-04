// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Interface for creating, configuring, and optimizing database table indexes to improve query performance.

import React, { useEffect, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery.js';
import { runQuery } from '../../utils/api.js';
import { SqlPreview } from '../layout/SharedComponents.jsx';
import { useToast } from '../layout/Toast.jsx';
import AlertBanner from "../layout/AlertBanner.jsx"

export default function CreateIndex() {
  const { tab: routeTab = 'create' } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/indexes/create/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-settings-2"></Icon> Index Management</h2></div>
      <div className="tab-bar">
        <div className={`tab-item ${routeTab === 'create' ? 'active' : ''}`} onClick={() => handleTabChange('create')}><Icon className="ti ti-plus"></Icon> Create</div>
        <div className={`tab-item ${routeTab === 'materialize' ? 'active' : ''}`} onClick={() => handleTabChange('materialize')}><Icon className="ti ti-hammer"></Icon> Materialize</div>
        <div className={`tab-item ${routeTab === 'drop' ? 'active' : ''}`} onClick={() => handleTabChange('drop')}><Icon className="ti ti-trash"></Icon> Drop</div>
      </div>
      {routeTab === 'create' && <CreateForm />}
      {routeTab === 'materialize' && <MaterializeForm />}
      {routeTab === 'drop' && <DropForm />}
    </div>
  );
}

function CreateForm() {
  const [db, setDb] = useState('');
  const [tbl, setTbl] = useState('');
  const [col, setCol] = useState('');
  const [name, setName] = useState('');
  const [idxType, setIdxType] = useState('minmax');
  const [granularity, setGranularity] = useState(1);
  const [setN, setSetN] = useState('');
  const [bfRate, setBfRate] = useState('');
  // Text index params
  const [tokenizer, setTokenizer] = useState('splitByNonAlpha');
  const [splitByStringS, setSplitByStringS] = useState(',');
  const [ngramsN, setNgramsN] = useState(3);
  const [sparseMin, setSparseMin] = useState(3);
  const [sparseMax, setSparseMax] = useState(8);
  const [sparseCutoff, setSparseCutoff] = useState(2);
  const [preprocessor, setPreprocessor] = useState('');
  const [dictBlockSize, setDictBlockSize] = useState('');
  const [dictFrontcoding, setDictFrontcoding] = useState('');
  const [postingBlockSize, setPostingBlockSize] = useState('');
  const [postingCodec, setPostingCodec] = useState('');
  const [result, setResult] = useState(null);

  const toast = useToast()

  const dbsQ = useQuery(), tblsQ = useQuery(), colsQ = useQuery();
  useEffect(() => { dbsQ.execute("SELECT DISTINCT database FROM system.tables WHERE engine LIKE '%MergeTree%' ORDER BY database"); }, []);
  useEffect(() => { if (db) tblsQ.execute(`SELECT name FROM system.tables WHERE database='${db}' AND engine LIKE '%MergeTree%' ORDER BY name`); }, [db]);
  useEffect(() => { if (db && tbl) colsQ.execute(`SELECT name, type FROM system.columns WHERE database='${db}' AND table='${tbl}' ORDER BY position`); }, [db, tbl]);

  function buildSql() {
    if (!db || !tbl || !col || !name.trim()) return '';
    let typeExpr = idxType;
    if (idxType === 'set') typeExpr = `set(${setN})`;
    else if (idxType === 'bloom_filter') typeExpr = `bloom_filter(${bfRate})`;
    else if (idxType === 'text') {
      let tok = tokenizer;
      if (tokenizer === 'splitByString') tok = `splitByString('${splitByStringS}')`;
      else if (tokenizer === 'ngrams') tok = `ngrams(${ngramsN})`;
      else if (tokenizer === 'sparseGrams') tok = `sparseGrams(${sparseMin}, ${sparseMax}, ${sparseCutoff})`;
      const parts = [`tokenizer = ${tok}`];
      if (preprocessor.trim()) parts.push(`preprocessor = ${preprocessor.trim()}`);
      if (dictBlockSize) parts.push(`dictionary_block_size = ${dictBlockSize}`);
      if (dictFrontcoding) parts.push(`dictionary_block_frontcoding_compression = ${dictFrontcoding}`);
      if (postingBlockSize) parts.push(`posting_list_block_size = ${postingBlockSize}`);
      if (postingCodec) parts.push(`posting_list_codec = '${postingCodec}'`);
      typeExpr = `text(${parts.join(', ')})`;
    }
    return `ALTER TABLE ${db}.${tbl} ADD INDEX ${name.trim()}(${col}) TYPE ${typeExpr} GRANULARITY ${granularity}`;
  }

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql());
      setResult({ ok: true, msg: 'Index created.' });
      setDb('')
      setCol('')
      setGranularity(1);
      setName('')
      setIdxType('minmax')

    }
    catch (err) { setResult({ ok: false, msg: err.message }); }
    finally {
      setTimeout(() => {
        setResult(null);
      }, 5000)
    }
  }

  return (

    <div>
      <AlertBanner result={result} setResult={setResult} />
      {/* {result && <div className={`alert-banner ${result.ok ? 'success' : 'danger'}`} style={{ marginBottom: 14 }}><Icon className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`}></Icon> {result.msg}<button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}><Icon className="ti ti-x"></Icon></button></div>} */}
      <form onSubmit={submit} className="card" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
          <div className="form-group"><label className="form-label">Database *</label><Select className="form-select" value={db} onChange={e => { setDb(e.target.value); setTbl(''); setCol(''); }} required><option value="">--</option>{dbsQ.data?.map(r => <option key={r.database}>{r.database}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Table *</label><Select className="form-select" value={tbl} onChange={e => { setTbl(e.target.value); setCol(''); }} required><option value="">--</option>{tblsQ.data?.map(r => <option key={r.name}>{r.name}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Column *</label><Select className="form-select" value={col} onChange={e => setCol(e.target.value)} required><option value="">--</option>{colsQ.data?.map(r => <option key={r.name} value={r.name}>{r.name} ({r.type})</option>)}</Select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
          <div className="form-group"><label className="form-label">Index Name *</label><input className="form-input" required value={name} onChange={e => setName(e.target.value)} placeholder="idx_mycolumn" /></div>
          <div className="form-group"><label className="form-label">Index Type</label><Select className="form-select" value={idxType} onChange={e => setIdxType(e.target.value)}><option value="minmax">minmax</option><option value="set">set</option><option value="bloom_filter">bloom_filter</option><option value="text">text</option></Select></div>
          <div className="form-group"><label className="form-label">Granularity</label><input className="form-input" type="number" min={1} value={granularity} onChange={e => setGranularity(parseInt(e.target.value) || 1)} /></div>
        </div>

        {idxType === 'set' && <div className="form-group" style={{ marginBottom: 14, maxWidth: 220 }}>
          <label className="form-label">Set N (max distinct values)</label>
          <input className="form-input" type="text" value={setN} onChange={e => {
            const value = e.target.value;
            if (!isNaN(Number(value))) {
              if (Number(value) >= 0) {
                setSetN(Number(value))
              } else {
                toast?.warning('Value should be greater than 0 !')
              }
            } else {
              toast?.warning('Only numberic value\'s!')
              setSetN('')
            }
          }} />
        </div>}

        {idxType === 'bloom_filter' && <div className="form-group" style={{ marginBottom: 14, maxWidth: 220 }}>
          <label className="form-label">False Positive Rate</label>
          <input className="form-input" type="number"
            value={bfRate}
            onChange={e => {
              const value = e.target.value;
              if (!isNaN(Number(value))) {
                if (Number(value) >= 0 && Number(value) <= 1) {
                  setBfRate(Number(value))
                } else {
                  toast?.warning('Value should be lessthan 1 or greater than 0 !')
                }
              } else {
                toast?.warning('Only numberic value\'s!')
                setBfRate('')
              }

            }} />
        </div>
        }

        {idxType === 'text' && (
          <div className="card" style={{ padding: 16, marginBottom: 14, background: 'var(--bg-elevated)' }}>
            <h4 style={{ fontSize: '14px', marginBottom: 12 }}><Icon className="ti ti-text-recognition"></Icon> Text Index Parameters</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              <div className="form-group"><label className="form-label">Tokenizer *</label><Select className="form-select" value={tokenizer} onChange={e => setTokenizer(e.target.value)}>
                <option value="splitByNonAlpha">splitByNonAlpha</option>
                <option value="splitByString">splitByString(S)</option>
                <option value="asciiCJK">asciiCJK</option>
                <option value="ngrams">ngrams(N)</option>
                <option value="sparseGrams">sparseGrams(min, max, cutoff)</option>
                <option value="array">array</option>
              </Select></div>
              {tokenizer === 'splitByString' && <div className="form-group"><label className="form-label">Separator</label><input className="form-input" value={splitByStringS} onChange={e => setSplitByStringS(e.target.value)} /></div>}
              {tokenizer === 'ngrams' && <div className="form-group"><label className="form-label">N</label><input className="form-input" type="number" min={1} value={ngramsN} onChange={e => setNgramsN(parseInt(e.target.value) || 3)} /></div>}
              {tokenizer === 'sparseGrams' && <>
                <div className="form-group"><label className="form-label">Min Length</label><input className="form-input" type="number" min={1} value={sparseMin} onChange={e => setSparseMin(parseInt(e.target.value) || 3)} /></div>
                <div className="form-group"><label className="form-label">Max Length</label><input className="form-input" type="number" min={1} value={sparseMax} onChange={e => setSparseMax(parseInt(e.target.value) || 8)} /></div>
                <div className="form-group"><label className="form-label">Min Cutoff</label><input className="form-input" type="number" min={1} value={sparseCutoff} onChange={e => setSparseCutoff(parseInt(e.target.value) || 2)} /></div>
              </>}
              <div className="form-group"><label className="form-label">Preprocessor (optional)</label><input className="form-input" value={preprocessor} onChange={e => setPreprocessor(e.target.value)} placeholder="expression(str)" /></div>
              <div className="form-group"><label className="form-label">Dict Block Size</label><input className="form-input" type="number" value={dictBlockSize} onChange={e => setDictBlockSize(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Dict Frontcoding</label><input className="form-input" type="number" value={dictFrontcoding} onChange={e => setDictFrontcoding(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Posting Block Size</label><input className="form-input" type="number" value={postingBlockSize} onChange={e => setPostingBlockSize(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Posting Codec</label><Select className="form-select" value={postingCodec} onChange={e => setPostingCodec(e.target.value)}><option value="">default</option><option value="none">none</option><option value="bitpacking">bitpacking</option></Select></div>
            </div>
          </div>
        )}

        <SqlPreview sql={buildSql()} />
        <div style={{ marginTop: 16 }}><button className="btn btn-primary" type="submit"><Icon className="ti ti-plus"></Icon> Create Index</button></div>
      </form>
    </div>


  );
}

function MaterializeForm() {
  const [db, setDb] = useState('');
  const [tbl, setTbl] = useState('');
  const [idxName, setIdxName] = useState('');
  const [result, setResult] = useState(null);

  const dbsQ = useQuery(), tblsQ = useQuery(), idxQ = useQuery();
  useEffect(() => { dbsQ.execute('SELECT DISTINCT database FROM system.data_skipping_indices ORDER BY database'); }, []);
  useEffect(() => { if (db) tblsQ.execute(`SELECT DISTINCT table FROM system.data_skipping_indices WHERE database='${db}' ORDER BY table`); }, [db]);
  useEffect(() => { if (db && tbl) idxQ.execute(`SELECT name FROM system.data_skipping_indices WHERE database='${db}' AND table='${tbl}' ORDER BY name`); }, [db, tbl]);

  const sql = db && tbl && idxName ? `ALTER TABLE ${db}.${tbl} MATERIALIZE INDEX ${idxName}` : '';

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: `Index '${idxName}' materialized.` });
      setDb('')
      setTbl('')
      setIdxName('')
    }
    catch (err) { setResult({ ok: false, msg: err.message }); }
    finally {
      setTimeout(() => {
        setResult(null);
      }, 5000)
    }
  }

  return (
    <div>
      <AlertBanner result={result} setResult={setResult} />
      {/* {result && <div className={`alert-banner ${result.ok ? 'success' : 'danger'}`} style={{ marginBottom: 14 }}><Icon className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`}></Icon> {result.msg}<button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}><Icon className="ti ti-x"></Icon></button></div>} */}
      <form onSubmit={submit} className="card" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
          <div className="form-group"><label className="form-label">Database *</label><Select className="form-select" value={db} onChange={e => { setDb(e.target.value); setTbl(''); setIdxName(''); }} required><option value="">--</option>{dbsQ.data?.map(r => <option key={r.database}>{r.database}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Table *</label><Select className="form-select" value={tbl} onChange={e => { setTbl(e.target.value); setIdxName(''); }} required><option value="">--</option>{tblsQ.data?.map(r => <option key={r.table}>{r.table}</option>)}</Select></div>
          <div className="form-group"><label className="form-label">Index *</label><Select className="form-select" value={idxName} onChange={e => setIdxName(e.target.value)} required><option value="">--</option>{idxQ.data?.map(r => <option key={r.name}>{r.name}</option>)}</Select></div>
        </div>
        <SqlPreview sql={sql} />
        <div style={{ marginTop: 16 }}><button className="btn btn-primary" type="submit" disabled={!sql}><Icon className="ti ti-hammer"></Icon> Materialize Index</button></div>
      </form>
    </div>
  );
}

function DropForm() {
  const toast = useToast();
  const [dropDb, setDropDb] = useState('');
  const [dropTbl, setDropTbl] = useState('');
  const [dropIdx, setDropIdx] = useState('');
  // const [dropOnCluster, setDropOnCluster] = useState('');
  const dropDbsQ = useQuery(), dropTblsQ = useQuery(), dropIdxsQ = useQuery(), clustersQ = useQuery();

  useEffect(() => {
    dropDbsQ.execute('SELECT DISTINCT database FROM system.data_skipping_indices ORDER BY database');
    clustersQ.execute("SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster");
  }, []);
  useEffect(() => { if (dropDb) dropTblsQ.execute(`SELECT DISTINCT table FROM system.data_skipping_indices WHERE database='${dropDb}' ORDER BY table`); }, [dropDb]);
  useEffect(() => { if (dropDb && dropTbl) dropIdxsQ.execute(`SELECT name FROM system.data_skipping_indices WHERE database='${dropDb}' AND table='${dropTbl}' ORDER BY name`); }, [dropDb, dropTbl]);

  function buildDropSql() {
    if (!dropDb || !dropTbl || !dropIdx) return '-- Select database, table, and index';
    let sql = `ALTER TABLE ${dropDb}.${dropTbl}`;
    // if (dropOnCluster) sql += ` ON CLUSTER '${dropOnCluster}'`;
    sql += ` DROP INDEX ${dropIdx}`;
    return sql;
  }

  async function executeDrop() {
    const sql = buildDropSql();
    if (sql.startsWith('--')) return;
    try {
      await runQuery(sql);
      toast.success(`Index "${dropIdx}" dropped.`);

      if (dropDb && dropTbl) dropIdxsQ.execute(`SELECT name FROM system.data_skipping_indices WHERE database='${dropDb}' AND table='${dropTbl}' ORDER BY name`);
    } catch (err) { toast.error(err.message); }
    finally {
      setDropIdx('');
      setDropDb("");
      setDropTbl("");
      // setDropOnCluster("");
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div className="form-group"><label className="form-label">Database *</label><Select className="form-select" value={dropDb} onChange={e => { setDropDb(e.target.value); setDropTbl(''); setDropIdx(''); }}><option value="">-- select --</option>{dropDbsQ.data?.map(r => <option key={r.database}>{r.database}</option>)}</Select></div>
        <div className="form-group"><label className="form-label">Table *</label><Select className="form-select" value={dropTbl} onChange={e => { setDropTbl(e.target.value); setDropIdx(''); }}><option value="">-- select --</option>{dropTblsQ.data?.map(r => <option key={r.table}>{r.table}</option>)}</Select></div>
        <div className="form-group">
          <label className="form-label">Index *</label><Select className="form-select" value={dropIdx} onChange={e => setDropIdx(e.target.value)}><option value="">-- select --</option>{dropIdxsQ.data?.map(r => <option key={r.name}>{r.name}</option>)}</Select></div>
        {/* <div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={dropOnCluster} onChange={e => setDropOnCluster(e.target.value)}><option value="">--</option>{clustersQ.data?.map(r => <option key={r.cluster}>{r.cluster}</option>)}</Select></div> */}
      </div>
      <SqlPreview sql={buildDropSql()} />
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-danger" onClick={executeDrop} disabled={!dropDb || !dropTbl || !dropIdx}><Icon className="ti ti-trash"></Icon> Drop Index</button>
      </div>
    </div>
  );
}
