import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import QueueCards from "../../src/frontend/components/queues/QueueCards.jsx";

describe("QueueCards", () => {
  it("renders summary cards with delta badges and state styling", () => {
    render(
      <QueueCards
        cards={[
          { label: "Active", value: "14", delta: "+2", state: "ok", sub: "current" },
          { label: "Blocked", value: "0", state: "neutral" },
        ]}
      />,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
    expect(document.querySelector(".state-ok")).not.toBeNull();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });
});
