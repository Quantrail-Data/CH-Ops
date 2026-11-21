// ScrollableTabBar.jsx - A tab bar that shows arrow buttons and a soft edge
// when its tabs do not fit. Without them, the user cannot see that more tabs
// are hidden (the scroll bar of .tab-bar is hidden on purpose).
// Copyright (C) 2026 Quantrail™ Data Private Limited

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// activeKey: the key of the open tab. When it changes, that tab scrolls into view.
export default function ScrollableTabBar({ children, activeKey, label = "Tabs" }) {
  const barRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    setCanScrollLeft(bar.scrollLeft > 1);
    setCanScrollRight(bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    updateArrows();
    bar.addEventListener("scroll", updateArrows, { passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateArrows);
    resizeObserver?.observe(bar);
    return () => {
      bar.removeEventListener("scroll", updateArrows);
      resizeObserver?.disconnect();
    };
  }, [updateArrows]);

  // Keep the open tab visible, also when it was opened from a link.
  useEffect(() => {
    const activeTab = barRef.current?.querySelector(".tab-item.active");
    activeTab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    updateArrows();
  }, [activeKey, updateArrows]);

  function scrollTabs(direction) {
    const bar = barRef.current;
    if (!bar) return;
    bar.scrollBy({ left: direction * bar.clientWidth * 0.7, behavior: "smooth" });
  }

  const classNames = ["tab-bar-scroll"];
  if (canScrollLeft) classNames.push("can-scroll-left");
  if (canScrollRight) classNames.push("can-scroll-right");

  return (
    <div className={classNames.join(" ")}>
      {canScrollLeft && (
        <button type="button" className="tab-bar-arrow" aria-label={`Show earlier ${label.toLowerCase()}`} onClick={() => scrollTabs(-1)}>
          <Icon className="ti ti-chevron-left" />
        </button>
      )}
      <div ref={barRef} className="tab-bar">
        {children}
      </div>
      {canScrollRight && (
        <button type="button" className="tab-bar-arrow" aria-label={`Show more ${label.toLowerCase()}`} onClick={() => scrollTabs(1)}>
          <Icon className="ti ti-chevron-right" />
        </button>
      )}
    </div>
  );
}
