// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Icon: renders a Tabler icon as crisp, resolution-independent SVG from an
// inlined sprite (universal browser support, including Safari, via same-document
// <use href="#tabler-NAME">). Default stroke width is 1.5.
//
// It is a drop-in for the old <i className="ti ti-NAME"> webfont icons: it keeps
// the original "ti ti-NAME" classes on the <svg>, so the entire existing icon
// styling system - semantic colours (.ti.ti-NAME), default colour (.ti), and
// size rules (.ti{font-size}, .btn .ti, media queries) - keeps applying through
// `currentColor` and `width/height:1em`, for both light and dark themes, with no
// per-call changes and no CSS colour rewrites.
//
// Any icon name that was not bundled into the sprite renders as a neutral inline
// SVG placeholder, so icons are always SVG and fully local (no webfont).
import React from "react";
import { ICON_NAMES } from "../../assets/iconSprite.js";

// Derive the icon token (e.g. "bucket", "database-filled") from an explicit
// `name` prop or from a Tabler className such as "ti ti-bucket".
function tokenOf(name, className) {
  if (name) return String(name).replace(/^ti-/, "").trim();
  const m = /\bti-([a-z0-9-]+)/i.exec(className || "");
  return m ? m[1] : "";
}

export default function Icon({ name, className = "", style, stroke = 1.5, title, ...rest }) {
  const token = tokenOf(name, className);

  // Unknown / not-yet-bundled icon: render a neutral inline SVG placeholder
  // rather than a webfont glyph, so every icon stays SVG and fully local.
  if (!token || !ICON_NAMES.has(token)) {
    const cls = `${className || (token ? `ti ti-${token}` : "ti")} chops-icon`.trim();
    return (
      <svg
        className={cls}
        viewBox="0 0 24 24"
        style={style}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        aria-label={title || undefined}
        focusable="false"
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        <rect x="4" y="4" width="16" height="16" rx="3" opacity="0.5" />
      </svg>
    );
  }

  // Preserve the ti/ti-NAME classes (colour + size cascade) and add chops-icon
  // (SVG sizing/alignment). chops-icon sets width/height:1em so font-size still
  // controls the rendered size exactly like the webfont did.
  const cls = `${className || `ti ti-${token}`} chops-icon`.trim();
  const filled = token.endsWith("-filled");

  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      style={style}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? undefined : stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <use href={`#tabler-${token}`} />
    </svg>
  );
}
