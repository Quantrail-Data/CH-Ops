// DateTimePicker - Date and time selection with dropdown controls
//
// A composite picker that splits datetime selection into a date input and
// three dropdown selects for hours, minutes, and seconds. Used throughout
// CHOps for scheduling alerts, backup jobs, and time-range filters.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useMemo } from 'react';
import Select from "../common/Select.jsx";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const SECONDS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parse(value) {
  if (!value) { const n = new Date(); const p = v => String(v).padStart(2,'0'); return { date: `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}`, hour: p(n.getHours()), minute: p(n.getMinutes()), second: '00' }; }
  const [d, t] = value.split(/[T ]/);
  const [h='00', m='00', s='00'] = (t||'').split(':');
  return { date: d||'', hour: h, minute: m, second: s };
}

export function DateTimePicker({ value, onChange, label ,name}) {
  const parts = useMemo(() => parse(value), [value]);
  const update = (f, v) => { const n = { ...parts, [f]: v }; onChange(`${n.date} ${n.hour}:${n.minute}:${n.second}`,name); };
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div className="datetime-picker-row">
        <input type="date" className="form-input datetime-date" value={parts.date} onChange={e => update('date', e.target.value)} />
        <Select className="form-select datetime-unit" value={parts.hour} onChange={e => update('hour', e.target.value)}>{HOURS.map(h => <option key={h} value={h}>{h}</option>)}</Select>
        <span className="datetime-sep">:</span>
        <Select className="form-select datetime-unit" value={parts.minute} onChange={e => update('minute', e.target.value)}>{MINUTES.map(m => <option key={m} value={m}>{m}</option>)}</Select>
        <span className="datetime-sep">:</span>
        <Select className="form-select datetime-unit" value={parts.second} onChange={e => update('second', e.target.value)}>{SECONDS.map(s => <option key={s} value={s}>{s}</option>)}</Select>
      </div>
    </div>
  );
}

export default DateTimePicker;


