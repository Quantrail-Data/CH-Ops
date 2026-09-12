// Button - thin wrapper over the existing .btn/.btn-* classes
//
// Renders exactly the same markup every hand-rolled <button className="btn
// btn-primary"> call site already produces, so it is a drop-in with zero
// visual change. forwardRef so callers that need to focus the button (e.g.
// ConfirmModal's autofocus-on-mount confirm button) can still get a ref.
//
// variant defaults to "primary", but pass variant={null} for the rare
// fully custom-styled button (e.g. a hardcoded inline background) that
// wants just the base .btn class with no variant's hover/color rules.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { forwardRef } from "react";
import Icon from "../common/Icon.jsx";
import Spinner from "./Spinner.jsx";

const Button = forwardRef(function Button(
  { variant = "primary", size, icon, loading = false, disabled = false, className = "", children, ...rest },
  ref,
) {
  const cls = ["btn", variant ? `btn-${variant}` : "", size === "sm" ? "btn-sm" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner size="sm" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
});

export default Button;
