// Breadcrumb - Section > Page trail shown at the left of the top bar
//
// Style guide: "Overview > Cluster Overview" in the top bar, muted parents and
// the current page in the primary text colour. Built on the shadcn/ui
// Breadcrumb, which gives the list markup and aria-current for screen readers.
//
// Copyright (C) 2026 Quantrail™ Data Private Limited
import { Fragment } from "react";
import Icon from "../common/Icon.jsx";
import { BREADCRUMB_MAP } from "../../utils/routeMeta.js";
import {
  Breadcrumb as ShadcnBreadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb.jsx";

export default function Breadcrumb({ route }) {
  const crumbs = BREADCRUMB_MAP[route] || [];
  return (
    <ShadcnBreadcrumb className="breadcrumb">
      <BreadcrumbList className="tw:flex-nowrap tw:gap-1 tw:text-[length:var(--text-sm)] tw:text-[var(--text-muted)]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={index}>
              {index > 0 && (
                <BreadcrumbSeparator className="tw:text-[var(--text-muted)]">
                  <Icon className="ti ti-chevron-right breadcrumb-sep" />
                </BreadcrumbSeparator>
              )}
              <BreadcrumbItem className="tw:min-w-0">
                {isLast ? (
                  <BreadcrumbPage className="breadcrumb-current tw:truncate tw:font-bold tw:text-[var(--text-primary)]">
                    {crumb}
                  </BreadcrumbPage>
                ) : (
                  <span className="tw:truncate">{crumb}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </ShadcnBreadcrumb>
  );
}
