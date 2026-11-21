// ui - Midnight design-system primitives
//
// The page-level parts of the CHOps New UI Style. Each one keeps the same name
// and props as before, so pages do not change. The interactive parts (Button,
// Badge, Kbd, Card, SegmentedControl, RowMenu) are built on shadcn/ui (Base UI),
// which brings keyboard support and focus handling. KpiCard, PageHeader,
// StatusDot and IconChip are layout only and keep their classes in global.css.
//
// Every primitive accepts `className` and spreads remaining props onto its
// root element, so a page can override locally without forking the component.
// Prefer adding a variant here over restyling a single call site.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Children, cloneElement, isValidElement, useId, useState } from "react";
import { cn } from "cn";
import Icon from "../common/Icon.jsx";
import { Input as ShadcnInput } from "./input.jsx";
import { Textarea as ShadcnTextarea } from "./textarea.jsx";
import { Label as ShadcnLabel } from "./label.jsx";
import { Alert as ShadcnAlert } from "./alert.jsx";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Badge as ShadcnBadge } from "./badge.jsx";
import { Kbd as ShadcnKbd } from "./kbd.jsx";
import { Card as ShadcnCard, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from "./card.jsx";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group.jsx";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu.jsx";

/** Status tones shared by Badge, StatusDot, KpiCard deltas and meters. */
export const TONES = ["neutral", "accent", "success", "warning", "danger", "info"];

const iconNode = (icon) =>
  typeof icon === "string" ? <Icon className={`ti ${icon.startsWith("ti-") ? icon : `ti-${icon}`}`} /> : icon;

/**
 * Button. variant: primary | secondary | ghost | danger | danger-soft.
 * size: md (32px) | sm (28px). `icon`/`iconRight` take a Tabler name
 * ("ti-refresh") or a node. `iconOnly` renders a square button; give it an
 * aria-label.
 *
 * The behavior is the Base UI button that shadcn/ui uses (focus, disabled
 * state, the render prop for links). The look is the Midnight .btn classes in
 * global.css, so every button in the app looks the same, including the rules
 * that pages and media queries add for .btn.
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
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      type={type}
      className={cn(
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
    </ButtonPrimitive>
  );
}

// Background and text color for each badge tone, from the Midnight tokens.
const BADGE_TONES = {
  neutral: "tw:bg-[var(--bg-hover)] tw:text-[var(--text-secondary)]",
  accent: "tw:bg-[var(--accent-soft)] tw:text-[var(--accent)]",
  success: "tw:bg-[var(--color-success-bg)] tw:text-[var(--color-success)]",
  warning: "tw:bg-[var(--color-warning-bg)] tw:text-[var(--color-warning)]",
  danger: "tw:bg-[var(--color-danger-bg)] tw:text-[var(--color-danger)]",
  info: "tw:bg-[var(--color-info-bg)] tw:text-[var(--color-info)]",
};

/** Pill badge. tone: neutral | accent | success | warning | danger | info. */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }) {
  return (
    <ShadcnBadge
      className={cn(
        // "badge" and "badge-<tone>" stay as hooks for page CSS and tests.
        "badge",
        `badge-${tone}`,
        "tw:h-auto tw:gap-1 tw:rounded-full tw:border-0 tw:px-[9px] tw:py-0.5 tw:text-xs tw:leading-normal tw:font-bold",
        BADGE_TONES[tone] || BADGE_TONES.neutral,
        className,
      )}
      {...rest}
    >
      {dot && <StatusDot tone={tone} />}
      {children}
    </ShadcnBadge>
  );
}

/** Small round status indicator. */
export function StatusDot({ tone = "neutral", className, ...rest }) {
  return <span className={cn("status-dot", tone !== "neutral" && tone, className)} aria-hidden="true" {...rest} />;
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
    <ShadcnKbd
      className={cn(
        // "kbd" stays as a hook: the navbar hides it on small screens.
        "kbd",
        "tw:h-auto tw:rounded-[var(--radius-xs)] tw:border tw:border-[var(--border-strong)] tw:bg-[var(--bg-raised)] tw:px-1.5 tw:py-px tw:font-mono tw:text-[length:var(--text-2xs)] tw:leading-normal tw:text-[var(--text-secondary)]",
        className,
      )}
      {...rest}
    >
      {children}
    </ShadcnKbd>
  );
}

/** Square indigo icon tile used on task cards and list rows. */
export function IconChip({ icon, className, ...rest }) {
  return (
    <span className={cn("icon-chip", className)} {...rest}>
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
    <ShadcnCard
      className={cn(
        "tw:gap-0 tw:rounded-[var(--radius-md)] tw:border tw:border-[var(--border-default)] tw:bg-[var(--bg-surface)] tw:py-0 tw:shadow-[var(--shadow-sm)] tw:ring-0",
        interactive && "tw:cursor-pointer tw:transition-colors tw:hover:border-[var(--border-strong)]",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <CardHeader className="tw:px-4 tw:pt-4 tw:pb-0">
          {title && <CardTitle className="tw:text-base tw:font-bold">{title}</CardTitle>}
          {subtitle && <CardDescription className="tw:text-sm tw:text-[var(--text-muted)]">{subtitle}</CardDescription>}
          {actions && <CardAction className="tw:flex tw:gap-2">{actions}</CardAction>}
        </CardHeader>
      )}
      {padded ? (
        <CardContent className={cn("tw:p-4", bodyClassName)} style={bodyStyle}>
          {children}
        </CardContent>
      ) : (
        children
      )}
    </ShadcnCard>
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
    <div className={cn("stat-card", compact && "stat-card-compact", className)} style={style} {...rest}>
      <div className="stat-card-head">
        <div className="stat-card-label">
          {icon && iconNode(icon)}
          <span>{label}</span>
        </div>
        {aside}
        {!aside && corner !== undefined && corner !== null && (
          <span className={cn("stat-card-delta", cornerTone && cornerTone !== "neutral" && cornerTone)}>{corner}</span>
        )}
      </div>
      <div className="stat-card-value" style={valueStyle} title={title ?? (typeof shown === "object" ? undefined : String(shown))}>
        {shown}
        {unit && shown !== "-" && <span className="stat-card-unit">{unit}</span>}
      </div>
      {meter !== undefined && meter !== null && (
        <div
          className={cn("stat-card-meter", meterTone && meterTone !== "accent" && meterTone)}
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
  const itemSize = size === "sm" ? "tw:min-h-6 tw:px-2.5 tw:py-0.5 tw:text-[length:var(--text-xs)]" : "tw:min-h-7 tw:px-3.5 tw:py-1 tw:text-[length:var(--text-sm)]";
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      value={[value]}
      spacing={0.5}
      className={cn(
        "tw:max-w-full tw:overflow-x-auto tw:rounded-[var(--radius-sm)] tw:border tw:border-[var(--border-default)] tw:bg-[var(--bg-surface)] tw:p-[3px] tw:[scrollbar-width:none]",
        "tw:[[data-theme=light]_&]:bg-[var(--bg-sunken)]",
        className,
      )}
      {...rest}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          disabled={option.disabled}
          className={cn(
            itemSize,
            "tw:h-auto tw:gap-1.5 tw:rounded-[var(--radius-xs)] tw:font-semibold tw:text-[var(--text-secondary)] tw:hover:bg-transparent tw:hover:text-[var(--text-primary)]",
            "tw:aria-pressed:bg-[var(--bg-active)] tw:aria-pressed:font-bold tw:aria-pressed:text-[var(--text-primary)] tw:[&[aria-pressed=true]_.ti]:text-[var(--accent)]",
            "tw:[[data-theme=light]_&]:aria-pressed:bg-[var(--bg-surface)] tw:[[data-theme=light]_&]:aria-pressed:shadow-[var(--shadow-sm)]",
          )}
          // Always report the click, even on the active option: callers use
          // a re-click for side effects (retrying a failed load, resetting a form).
          onClick={() => onChange?.(option.value)}
        >
          {option.icon && iconNode(option.icon)}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Page heading row: title, muted subtitle line, right-aligned actions. */
export function PageHeader({ title, subtitle, actions, className, children, ...rest }) {
  return (
    <div className={cn("page-header", className)} {...rest}>
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
 * RowMenu: the style guide's "..." row actions menu, built on the shadcn
 * DropdownMenu. The menu opens in a portal, so scrolling table containers
 * cannot clip it. Arrow keys move between items and Escape closes it.
 *
 * items: [{ label, icon?, onClick, disabled?, danger?, divider? }]
 * Each item carries title={label}, so it can be found by its name.
 */
export function RowMenu({ label, items, triggerLabel, className }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className={cn("row-menu-trigger", className)}
            aria-label={triggerLabel || (label ? `Actions for ${label}` : "Actions")}
          />
        }
      >
        <Icon className="ti ti-dots" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tw:min-w-[200px]">
        <DropdownMenuGroup>
          {label && <DropdownMenuLabel>{label}</DropdownMenuLabel>}
          {items.map((item, index) =>
            item.divider ? (
              <DropdownMenuSeparator key={`divider-${index}`} />
            ) : (
              <DropdownMenuItem
                key={item.label}
                title={item.label}
                disabled={item.disabled}
                variant={item.danger ? "destructive" : "default"}
                className="tw:font-semibold"
                onClick={() => item.onClick?.()}
              >
                {item.icon && iconNode(item.icon)}
                {item.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The Midnight look of a text field: the same as the old .form-input class.
// The width is the browser default unless the page sets one, as before.
const FIELD_LOOK =
  "tw:h-auto tw:min-h-[var(--control-h)] tw:w-auto tw:rounded-[var(--radius-sm)] tw:border tw:border-[var(--border-default)] tw:bg-[var(--input-bg)] tw:px-3 tw:py-[5px] tw:font-data tw:text-[length:var(--text-base)] tw:text-[var(--text-primary)] tw:dark:bg-[var(--input-bg)] tw:md:text-[length:var(--text-base)] tw:hover:border-[var(--border-strong)] tw:focus-visible:border-[var(--accent)] tw:focus-visible:ring-0 tw:focus-visible:shadow-[var(--focus-ring)] tw:placeholder:font-sans tw:placeholder:text-[var(--text-muted)] tw:disabled:opacity-55";

/** Text input with the Midnight look, on the shadcn Input. */
export function Input({ className, ...rest }) {
  return <ShadcnInput className={cn("form-input", FIELD_LOOK, className)} {...rest} />;
}

/** Multi-line text input with the Midnight look, on the shadcn Textarea. */
export function Textarea({ className, ...rest }) {
  return <ShadcnTextarea className={cn("form-textarea", FIELD_LOOK, "tw:field-sizing-fixed", className)} {...rest} />;
}

/** Form label with the Midnight look, on the shadcn Label. */
export function Label({ className, ...rest }) {
  return (
    <ShadcnLabel
      className={cn("form-label tw:gap-1.5 tw:text-[length:var(--text-sm)] tw:font-semibold tw:text-[var(--text-primary)]", className)}
      {...rest}
    />
  );
}

/**
 * A label, one control and an optional hint, with the label tied to the
 * control (htmlFor and id), so a click on the label focuses the control and
 * screen readers read the label. The control gets an id if it has none.
 *
 *   <FormField label="Username" hint="Letters and digits"><Input value={name} /></FormField>
 */
export function FormField({ label, hint, className, style, children }) {
  const autoId = useId();
  const control = Children.only(children);
  const controlId = (isValidElement(control) && control.props.id) || autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  return (
    <div className={cn("form-group", className)} style={style}>
      <Label htmlFor={controlId}>{label}</Label>
      {cloneElement(control, { id: controlId, "aria-describedby": hintId })}
      {hint && (
        <p id={hintId} className="tw:text-xs tw:text-[var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Password input with a show/hide button. The button is a real button with a
 * name, so it works with the keyboard and screen readers.
 */
export function PasswordInput({ className, style, ...rest }) {
  const [isShown, setIsShown] = useState(false);
  return (
    <div className="tw:relative tw:w-full" style={style}>
      <Input
        type={isShown ? "text" : "password"}
        className={cn("tw:w-full tw:pr-10", className)}
        {...rest}
      />
      <button
        type="button"
        className="tw:absolute tw:top-1/2 tw:right-2 tw:inline-flex tw:size-7 tw:-translate-y-1/2 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[var(--radius-xs)] tw:border-0 tw:bg-transparent tw:text-[var(--text-muted)] tw:hover:text-[var(--text-primary)]"
        aria-label={isShown ? "Hide password" : "Show password"}
        aria-pressed={isShown}
        onClick={() => setIsShown((value) => !value)}
      >
        <Icon className={`ti ${isShown ? "ti-eye-off" : "ti-eye"}`} />
      </button>
    </div>
  );
}


// Background, border and text color for each notice tone, from the Midnight tokens.
const NOTICE_TONES = {
  info: "tw:bg-[var(--color-info-bg)] tw:border-[var(--color-info-border)] tw:text-[var(--color-info)]",
  success: "tw:bg-[var(--color-success-bg)] tw:border-[var(--color-success-border)] tw:text-[var(--color-success)]",
  warning: "tw:bg-[var(--color-warning-bg)] tw:border-[var(--color-warning-border)] tw:text-[var(--color-warning)]",
  danger: "tw:bg-[var(--color-danger-bg)] tw:border-[var(--color-danger-border)] tw:text-[var(--color-danger)]",
};

/**
 * Notice banner (the old .alert-banner), on the shadcn Alert.
 * tone: info | success | warning | danger. icon: a Tabler name or a node.
 * Danger and warning notices are announced at once (role "alert"); info and
 * success are polite (role "status"). onDismiss adds a close button.
 */
export function Notice({ tone = "info", icon, onDismiss, className, children, ...rest }) {
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";
  return (
    <ShadcnAlert
      role={role}
      className={cn(
        "alert-banner",
        tone,
        "tw:flex tw:items-start tw:gap-2.5 tw:rounded-[var(--radius-sm)] tw:border tw:px-3.5 tw:py-3 tw:text-[length:var(--text-sm)] tw:font-semibold",
        NOTICE_TONES[tone] || NOTICE_TONES.info,
        className,
      )}
      {...rest}
    >
      {icon && iconNode(icon)}
      <div className="tw:min-w-0 tw:flex-1">{children}</div>
      {onDismiss && (
        <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss" onClick={onDismiss} className="tw:-my-1">
          <Icon className="ti ti-x" />
        </Button>
      )}
    </ShadcnAlert>
  );
}
