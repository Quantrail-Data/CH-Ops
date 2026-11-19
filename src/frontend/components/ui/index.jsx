// ui - Midnight design-system primitives
//
// Thin React wrappers over the global component classes in styles/global.css
// (.btn, .badge, .card, .stat-card, .segmented, .page-header, ...). The classes
// carry the look; these components carry the markup, so every page renders the
// same structure and picks up theme changes from the tokens alone.
//
// Every primitive accepts `className` and `style` and spreads remaining props
// onto its root element, so a page can override locally without forking the
// component. Prefer adding a variant here over restyling a single call site.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../common/Icon.jsx";

const cx = (...parts) => parts.filter(Boolean).join(" ");

/** Status tones shared by Badge, StatusDot, KpiCard deltas and meters. */
export const TONES = ["neutral", "accent", "success", "warning", "danger", "info"];

const iconNode = (icon) =>
  typeof icon === "string" ? <Icon className={`ti ${icon.startsWith("ti-") ? icon : `ti-${icon}`}`} /> : icon;

/**
 * Button. variant: primary | secondary | ghost | danger | danger-soft.
 * size: md (34px) | sm (28px). `icon`/`iconRight` take a Tabler name
 * ("ti-refresh") or a node. `iconOnly` renders a square button; give it an
 * aria-label.
 */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  iconOnly = false,
  loading = false,
  type = "button",
  className,
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      type={type}
      className={cx(
        "btn",
        `btn-${variant}`,
        size === "sm" && "btn-sm",
        iconOnly && "btn-icon",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="loading-spinner" style={{ width: 14, height: 14 }} /> : icon && iconNode(icon)}
      {children}
      {iconRight && iconNode(iconRight)}
    </button>
  );
}

/** Pill badge. tone: neutral | accent | success | warning | danger | info. */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }) {
  return (
    <span className={cx("badge", `badge-${tone}`, className)} {...rest}>
      {dot && <StatusDot tone={tone} />}
      {children}
    </span>
  );
}

/** Small round status indicator. */
export function StatusDot({ tone = "neutral", className, ...rest }) {
  return <span className={cx("status-dot", tone !== "neutral" && tone, className)} aria-hidden="true" {...rest} />;
}

/** True on macOS / iOS, where the command modifier is Cmd, not Ctrl. */
export function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(p);
}

/**
 * Platform label for a Ctrl/Cmd shortcut: shortcutLabel("K") is "⌘K" on a Mac
 * and "Ctrl K" elsewhere. Handlers should accept metaKey || ctrlKey.
 */
export function shortcutLabel(key) {
  return isMacPlatform() ? `⌘${key}` : `Ctrl ${key}`;
}

/** Keyboard hint, e.g. <Kbd>{shortcutLabel("K")}</Kbd>. */
export function Kbd({ className, children, ...rest }) {
  return (
    <kbd className={cx("kbd", className)} {...rest}>
      {children}
    </kbd>
  );
}

/** Square indigo icon tile used on task cards and list rows. */
export function IconChip({ icon, className, ...rest }) {
  return (
    <span className={cx("icon-chip", className)} {...rest}>
      {iconNode(icon)}
    </span>
  );
}

/**
 * Card: solid surface with an optional header (title, subtitle, actions).
 * Set `padded={false}` when the body is a full-bleed table or chart.
 */
export function Card({
  title,
  subtitle,
  actions,
  interactive = false,
  padded = true,
  className,
  bodyClassName,
  bodyStyle,
  children,
  ...rest
}) {
  const hasHeader = title || subtitle || actions;
  return (
    <div className={cx("card", interactive && "card-interactive", className)} {...rest}>
      {hasHeader && (
        <div className="card-header">
          <div style={{ minWidth: 0 }}>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
      )}
      {padded ? (
        <div className={cx("card-body", bodyClassName)} style={bodyStyle}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/**
 * KPI card (style guide "KPI card"): muted label, optional delta/status at the
 * top right, a large B612 value with optional unit, an optional meter bar and
 * an optional footnote.
 *
 *   <KpiCard label="CPU" value={38} unit="%" status="normal" meter={38} />
 *   <KpiCard label="Queries/s" value="2,418" delta="+12%" deltaTone="success" />
 *
 * `compact` shrinks the value for dense rows of facts (version, uptime...).
 * `aside` replaces the top-right text with any node, e.g. a <Badge>.
 */
export function KpiCard({
  label,
  value,
  unit,
  icon,
  delta,
  deltaTone,
  status,
  statusTone = "neutral",
  meter,
  meterTone,
  foot,
  aside,
  compact = false,
  title,
  className,
  style,
  valueStyle,
  ...rest
}) {
  const shown = value === null || value === undefined || value === "" ? "-" : value;
  const corner = delta ?? status;
  const cornerTone = delta !== undefined && delta !== null ? deltaTone : statusTone;
  return (
    <div className={cx("stat-card", compact && "stat-card-compact", className)} style={style} {...rest}>
      <div className="stat-card-head">
        <div className="stat-card-label">
          {icon && iconNode(icon)}
          <span>{label}</span>
        </div>
        {aside}
        {!aside && corner !== undefined && corner !== null && (
          <span className={cx("stat-card-delta", cornerTone && cornerTone !== "neutral" && cornerTone)}>{corner}</span>
        )}
      </div>
      <div className="stat-card-value" style={valueStyle} title={title ?? (typeof shown === "object" ? undefined : String(shown))}>
        {shown}
        {unit && shown !== "-" && <span className="stat-card-unit">{unit}</span>}
      </div>
      {meter !== undefined && meter !== null && (
        <div
          className={cx("stat-card-meter", meterTone && meterTone !== "accent" && meterTone)}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampPct(meter)}
          aria-label={typeof label === "string" ? label : undefined}
        >
          <span style={{ width: `${clampPct(meter)}%` }} />
        </div>
      )}
      {foot && <div className="stat-card-foot">{foot}</div>}
    </div>
  );
}

/**
 * Segmented control (style guide "Live / Topology / Disks"): a group of
 * toggle buttons, the active one marked with aria-pressed. onChange fires on
 * every click, including the already-active option.
 * options: [{ value, label, icon?, disabled?, title? }]
 */
export function SegmentedControl({ options, value, onChange, size, className, ariaLabel, ...rest }) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx("segmented", size === "sm" && "segmented-sm", className)} {...rest}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.title}
            disabled={o.disabled}
            className={cx("segmented-item", active && "active")}
            // Always report the click, even on the active option: callers use
            // a re-click for side effects (retrying a failed load, resetting a form).
            onClick={() => onChange?.(o.value)}
          >
            {o.icon && iconNode(o.icon)}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Page heading row: title, muted subtitle line, right-aligned actions. */
export function PageHeader({ title, subtitle, actions, className, children, ...rest }) {
  return (
    <div className={cx("page-header", className)} {...rest}>
      <div style={{ minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/**
 * RowMenu: the style guide's "..." row actions menu. A ghost icon trigger that
 * opens a .menu panel, portalled to <body> and fixed-positioned so scrolling
 * table containers cannot clip it. Closes on item click, outside click,
 * Escape, scroll or resize.
 *
 * items: [{ label, icon?, onClick, disabled?, danger?, divider? }]
 * Each item button carries title={label}, so it can be found by its name.
 */
export function RowMenu({ label, items, triggerLabel, className }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e?.type === "keydown" && e.key !== "Escape") return;
      if (e?.type === "mousedown" && (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target))) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cx("btn btn-ghost btn-sm btn-icon row-menu-trigger", open && "active", className)}
        aria-label={triggerLabel || (label ? `Actions for ${label}` : "Actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon className="ti ti-dots" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="menu row-menu"
            style={{ position: "fixed", top: pos?.top ?? 0, right: pos?.right ?? 8, zIndex: 10001 }}
          >
            {label && <div className="menu-label">{label}</div>}
            {items.map((it, i) =>
              it.divider ? (
                <div key={`d${i}`} className="menu-divider" />
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  title={it.label}
                  className={cx("menu-item", it.danger && "danger")}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  {it.icon && iconNode(it.icon)}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
