// Breadcrumb - Section > Page trail shown at the left of the top bar
//
// Style guide: "Overview > Cluster Overview" in the top bar, muted parents and
// the current page in the primary text colour.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import Icon from "../common/Icon.jsx";
import { BREADCRUMB_MAP } from "../../utils/routeMeta.js";

export default function Breadcrumb({ route }) {
  const crumbs = BREADCRUMB_MAP[route];
  if (!crumbs) return <nav className="breadcrumb" aria-label="Breadcrumb" />;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="breadcrumb-item">
            {i > 0 && <Icon className="ti ti-chevron-right breadcrumb-sep" />}
            <span className={last ? "breadcrumb-current" : undefined} aria-current={last ? "page" : undefined}>
              {c}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
