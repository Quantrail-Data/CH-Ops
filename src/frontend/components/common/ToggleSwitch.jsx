// ToggleSwitch - an on/off switch with a label, on the shadcn/ui Switch.
//
// The label is tied to the switch, so a click on the label toggles it and
// screen readers read the label as the switch name. onChange gets an object
// like a checkbox change event ({ target: { checked } }), as before, so the
// pages do not change.
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useId } from "react";
import { Switch } from "../ui/switch.jsx";

export default function ToggleSwitch({
  checked = false,
  onChange,
  label,
  info = null,
  verticalAlignment = false,
  btnContainer = false,
}) {
  const switchId = useId();

  function onCheckedChange(isChecked) {
    onChange?.({ target: { checked: isChecked } });
  }

  return (
    <div
      className="form-group"
      style={
        verticalAlignment || btnContainer
          ? { paddingTop: 0 }
          : { display: "flex", alignItems: "center", paddingTop: 22, gap: 6 }
      }
    >
      <div
        className="form-label"
        style={
          verticalAlignment
            ? { flexDirection: "column-reverse", alignItems: "center", justifyContent: "start", gap: "12px" }
            : {}
        }
      >
        {/* The old switch was 34 x 20 px; keep that size. */}
        <Switch
          id={switchId}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="tw:data-[size=default]:h-5 tw:data-[size=default]:w-[34px] tw:mr-[5px] tw:data-checked:bg-[var(--accent-solid)] tw:data-unchecked:bg-[var(--border-strong)] tw:dark:data-unchecked:bg-[var(--border-strong)] tw:cursor-pointer"
        />
        <label htmlFor={switchId} style={{ cursor: "pointer" }}>
          {label}
        </label>
        {info && (
          <small
            style={{
              display: "block",
              color: "var(--text-muted)",
              fontSize: "0.6875rem",
              marginTop: 2,
            }}
          >
            {info}
          </small>
        )}
      </div>
    </div>
  );
}
